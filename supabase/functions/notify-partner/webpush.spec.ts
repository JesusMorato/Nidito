// @vitest-environment node
// Prueba del cifrado de los avisos: se cifra como lo haría el servidor y se
// descifra haciendo el papel del navegador. Si el mensaje vuelve entero, la
// implementación de RFC 8291 es correcta.
import { describe, expect, it } from 'vitest'
import { b64urlABytes, bytesAB64url, cabeceraVapid, cifrar, unir } from './webpush'

const texto = new TextEncoder()
const desdeTexto = new TextDecoder()

/** Hace de navegador: genera el par de claves y el secreto de una suscripción. */
async function aparatoFalso() {
  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const publica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey))
  const secreto = crypto.getRandomValues(new Uint8Array(16))
  return {
    privada: par.privateKey,
    publicaBruta: publica,
    p256dh: bytesAB64url(publica),
    auth: bytesAB64url(secreto),
    secreto,
  }
}

/** Deshace lo que hizo cifrar(), igual que haría el navegador al recibirlo. */
async function descifrar(cuerpo: Uint8Array, aparato: Awaited<ReturnType<typeof aparatoFalso>>) {
  const sal = cuerpo.slice(0, 16)
  const largoClave = cuerpo[20]
  const clavePublicaServidor = cuerpo.slice(21, 21 + largoClave)
  const cifrado = cuerpo.slice(21 + largoClave)

  const claveServidor = await crypto.subtle.importKey(
    'raw', clavePublicaServidor, { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  )
  const compartido = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: claveServidor }, aparato.privada, 256),
  )
  const claveCompartida = await crypto.subtle.importKey('raw', compartido, 'HKDF', false, ['deriveBits'])
  const ikm = new Uint8Array(await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: aparato.secreto,
      info: unir(texto.encode('WebPush: info'), new Uint8Array([0]), aparato.publicaBruta, clavePublicaServidor),
    },
    claveCompartida, 256,
  ))
  const claveIkm = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bitsClave = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: sal, info: unir(texto.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])) },
    claveIkm, 128,
  )
  const nonce = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: sal, info: unir(texto.encode('Content-Encoding: nonce'), new Uint8Array([0])) },
    claveIkm, 96,
  ))
  const claveAes = await crypto.subtle.importKey('raw', bitsClave, { name: 'AES-GCM' }, false, ['decrypt'])
  const plano = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, claveAes, cifrado))
  // El último byte es el delimitador (0x02)
  expect(plano[plano.length - 1]).toBe(2)
  return desdeTexto.decode(plano.slice(0, -1))
}

describe('cifrar', () => {
  it('el navegador puede descifrar lo que cifra el servidor', async () => {
    const aparato = await aparatoFalso()
    const mensaje = JSON.stringify({ titulo: 'Gasto repartido', cuerpo: 'Marta ha apuntado Compra: 86,40 €. Te toca 43,20 €.' })
    const cuerpo = await cifrar(aparato.p256dh, aparato.auth, mensaje)
    expect(await descifrar(cuerpo, aparato)).toBe(mensaje)
  })

  it('respeta la estructura que espera el navegador', async () => {
    const aparato = await aparatoFalso()
    const cuerpo = await cifrar(aparato.p256dh, aparato.auth, 'hola')
    // sal (16) + tamaño de bloque (4) + largo de clave (1) + clave (65) + cifrado
    expect(cuerpo[20]).toBe(65)
    expect(new DataView(cuerpo.buffer, cuerpo.byteOffset, cuerpo.length).getUint32(16)).toBe(4096)
    // El punto de la clave pública va sin comprimir: empieza por 0x04
    expect(cuerpo[21]).toBe(4)
    // "hola" (4) + delimitador (1) + etiqueta GCM (16) = 21 bytes cifrados
    expect(cuerpo.length).toBe(16 + 4 + 1 + 65 + 21)
  })

  it('cada envío usa una sal y una clave distintas', async () => {
    const aparato = await aparatoFalso()
    const a = await cifrar(aparato.p256dh, aparato.auth, 'hola')
    const b = await cifrar(aparato.p256dh, aparato.auth, 'hola')
    expect(bytesAB64url(a)).not.toBe(bytesAB64url(b))
  })

  it('con un secreto que no es el del aparato, no se puede descifrar', async () => {
    const aparato = await aparatoFalso()
    const otro = await aparatoFalso()
    const cuerpo = await cifrar(aparato.p256dh, otro.auth, 'hola')
    await expect(descifrar(cuerpo, aparato)).rejects.toThrow()
  })
})

describe('cabeceraVapid', () => {
  async function clavesVapid() {
    const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    return {
      publica: bytesAB64url(new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey))),
      privada: bytesAB64url(new Uint8Array(await crypto.subtle.exportKey('pkcs8', par.privateKey))),
    }
  }

  it('firma un JWT que se puede comprobar con la clave pública', async () => {
    const claves = await clavesVapid()
    const cabecera = await cabeceraVapid({
      endpoint: 'https://web.push.apple.com/abc123',
      clavePublica: claves.publica,
      clavePrivada: claves.privada,
      sujeto: 'https://jesusmorato.github.io/GasTitos/',
      ahora: 1_800_000_000,
    })

    const jwt = /vapid t=([^,]+), k=(.+)/.exec(cabecera)
    expect(jwt).not.toBeNull()
    expect(jwt![2]).toBe(claves.publica)

    const [cab, cuerpo, firma] = jwt![1].split('.')
    const clave = await crypto.subtle.importKey(
      'raw', b64urlABytes(claves.publica), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    )
    const valida = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, clave, b64urlABytes(firma), texto.encode(`${cab}.${cuerpo}`),
    )
    expect(valida).toBe(true)
  })

  it('el destinatario es el servidor del aviso y caduca en 12 horas', async () => {
    const claves = await clavesVapid()
    const cabecera = await cabeceraVapid({
      endpoint: 'https://fcm.googleapis.com/fcm/send/xyz?token=1',
      clavePublica: claves.publica,
      clavePrivada: claves.privada,
      sujeto: 'mailto:hola@example.com',
      ahora: 1_000_000,
    })
    const cuerpo = JSON.parse(desdeTexto.decode(b64urlABytes(/t=[^.]+\.([^.]+)\./.exec(cabecera)![1])))
    expect(cuerpo.aud).toBe('https://fcm.googleapis.com')
    expect(cuerpo.exp).toBe(1_000_000 + 43_200)
    expect(cuerpo.sub).toBe('mailto:hola@example.com')
  })
})
