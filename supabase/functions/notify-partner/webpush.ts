// ============================================================
// Web Push a mano, solo con WebCrypto (sin librerías):
//   - cifrar():        cifrado del aviso, RFC 8291 (aes128gcm)
//   - cabeceraVapid(): firma que identifica al servidor, RFC 8292
// Está aparte de index.ts para poder probarlo con Vitest (webpush.spec.ts).
// ============================================================

const texto = new TextEncoder()

export function b64urlABytes(s: string): Uint8Array {
  const b64 = s.trim().replace(/-/g, '+').replace(/_/g, '/')
  const relleno = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  const bin = atob(b64 + relleno)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function bytesAB64url(b: Uint8Array): string {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function unir(...trozos: Uint8Array[]): Uint8Array {
  const total = trozos.reduce((a, t) => a + t.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const t of trozos) {
    out.set(t, pos)
    pos += t.length
  }
  return out
}

/** Etiqueta con el 0x00 final que pide HKDF en esta especificación. */
function info(etiqueta: string): Uint8Array {
  return unir(texto.encode(etiqueta), new Uint8Array([0]))
}

/**
 * Cabecera "Authorization" que identifica a este servidor ante el servicio de
 * avisos del navegador. Es un JWT firmado con la clave privada VAPID.
 */
export async function cabeceraVapid(opciones: {
  endpoint: string
  /** Clave pública VAPID en base64url (los 65 bytes del punto sin comprimir). */
  clavePublica: string
  /** Clave privada VAPID en base64url (formato PKCS#8). */
  clavePrivada: string
  /** Quién envía: un "mailto:" o una dirección https. */
  sujeto: string
  ahora?: number
}): Promise<string> {
  const ahora = opciones.ahora ?? Math.floor(Date.now() / 1000)
  const cabecera = bytesAB64url(texto.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const cuerpo = bytesAB64url(texto.encode(JSON.stringify({
    aud: new URL(opciones.endpoint).origin,
    exp: ahora + 12 * 3600,
    sub: opciones.sujeto,
  })))
  const clave = await crypto.subtle.importKey(
    'pkcs8', b64urlABytes(opciones.clavePrivada), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  )
  // WebCrypto devuelve la firma ECDSA como r||s, que es justo lo que pide un JWT.
  const firma = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, clave, texto.encode(`${cabecera}.${cuerpo}`)),
  )
  return `vapid t=${cabecera}.${cuerpo}.${bytesAB64url(firma)}, k=${opciones.clavePublica}`
}

/**
 * Cifra el mensaje para un aparato concreto. Devuelve el cuerpo tal cual hay que
 * enviarlo, con la cabecera "Content-Encoding: aes128gcm".
 */
export async function cifrar(p256dh: string, authSecret: string, mensaje: string): Promise<Uint8Array> {
  const clavePublicaAparato = b64urlABytes(p256dh)   // 65 bytes, punto sin comprimir
  const secretoAparato = b64urlABytes(authSecret)    // 16 bytes

  const claveAparato = await crypto.subtle.importKey(
    'raw', clavePublicaAparato, { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  )
  const efimera = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const clavePublicaServidor = new Uint8Array(await crypto.subtle.exportKey('raw', efimera.publicKey))

  const compartido = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: claveAparato }, efimera.privateKey, 256),
  )

  // Material de partida, mezclando el secreto del aparato con las dos claves públicas.
  const claveCompartida = await crypto.subtle.importKey('raw', compartido, 'HKDF', false, ['deriveBits'])
  const ikm = new Uint8Array(await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: secretoAparato,
      info: unir(texto.encode('WebPush: info'), new Uint8Array([0]), clavePublicaAparato, clavePublicaServidor),
    },
    claveCompartida, 256,
  ))

  // De ahí salen la clave de cifrado y el nonce.
  const sal = crypto.getRandomValues(new Uint8Array(16))
  const claveIkm = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bitsClave = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: sal, info: info('Content-Encoding: aes128gcm') }, claveIkm, 128,
  )
  const nonce = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: sal, info: info('Content-Encoding: nonce') }, claveIkm, 96,
  ))

  const claveAes = await crypto.subtle.importKey('raw', bitsClave, { name: 'AES-GCM' }, false, ['encrypt'])
  // El 0x02 del final marca que este es el último (y único) bloque del mensaje.
  const plano = unir(texto.encode(mensaje), new Uint8Array([2]))
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, claveAes, plano))

  const tamBloque = new Uint8Array(4)
  new DataView(tamBloque.buffer).setUint32(0, 4096)
  return unir(sal, tamBloque, new Uint8Array([clavePublicaServidor.length]), clavePublicaServidor, cifrado)
}
