// Avisos en el móvil (Web Push): las partes que no tocan el navegador, para poder probarlas.

/** Motivo por el que este aparato no puede recibir avisos. */
export type MotivoSinAvisos = 'sin-clave' | 'navegador' | 'ios-sin-instalar' | 'bloqueado'

export interface EstadoAvisos {
  disponible: boolean
  motivo?: MotivoSinAvisos
  /** Explicación en lenguaje llano de lo que hay que hacer. */
  texto: string
}

/**
 * Decide si se pueden pedir avisos en este aparato y, si no, por qué.
 * El orden importa: primero lo que no tiene arreglo desde la app.
 */
export function estadoAvisos(e: {
  /** Clave pública configurada (VITE_VAPID_PUBLIC_KEY). */
  clave: string
  /** El navegador tiene service worker, PushManager y Notification. */
  soportado: boolean
  ios: boolean
  /** La app se ha abierto desde el icono de la pantalla de inicio. */
  instalada: boolean
  permiso: NotificationPermission | 'sin-api'
}): EstadoAvisos {
  if (!e.clave) {
    return { disponible: false, motivo: 'sin-clave', texto: 'Los avisos aún no están configurados en esta copia de la app.' }
  }
  if (e.ios && !e.instalada) {
    return {
      disponible: false,
      motivo: 'ios-sin-instalar',
      texto: 'En el iPhone los avisos solo funcionan si abres Nidito desde el icono de la pantalla de inicio. Añádela con el botón de compartir de Safari → "Añadir a pantalla de inicio" y vuelve a entrar desde ahí.',
    }
  }
  if (!e.soportado) {
    return { disponible: false, motivo: 'navegador', texto: 'Este navegador no sabe enseñar avisos. Prueba desde el iPhone con la app instalada, o desde Chrome en el ordenador.' }
  }
  if (e.permiso === 'denied') {
    return {
      disponible: false,
      motivo: 'bloqueado',
      texto: 'Has bloqueado los avisos de Nidito. Se vuelven a permitir en los ajustes del navegador (en el iPhone: Ajustes → Notificaciones → Nidito).',
    }
  }
  return { disponible: true, texto: 'Recibirás un aviso cuando tu pareja añada una casa, la valore o comente.' }
}

/** Convierte la clave pública (texto base64url) al formato que pide el navegador. */
export function claveAplicacion(base64url: string): Uint8Array {
  const base64 = base64url.trim().replace(/-/g, '+').replace(/_/g, '/')
  const relleno = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4))
  const bruto = atob(base64 + relleno)
  const out = new Uint8Array(bruto.length)
  for (let i = 0; i < bruto.length; i++) out[i] = bruto.charCodeAt(i)
  return out
}

/** Nombre corto del aparato, para que en Ajustes se entienda de dónde es cada permiso. */
export function nombreAparato(userAgent: string): string {
  if (/iPhone/i.test(userAgent)) return 'iPhone'
  if (/iPad/i.test(userAgent)) return 'iPad'
  if (/Android/i.test(userAgent)) return 'Android'
  if (/Windows/i.test(userAgent)) return 'Windows'
  if (/Macintosh|Mac OS/i.test(userAgent)) return 'Mac'
  return 'Este navegador'
}

/**
 * ¿El permiso guardado en el navegador se pidió con esta misma clave?
 * Si se cambian las claves del servidor, los permisos viejos dejan de valer y
 * hay que volver a apuntarse, o los envíos se rechazan.
 */
export function mismaClave(usada: ArrayBuffer | null | undefined, claveB64url: string): boolean {
  if (!usada || !claveB64url) return false
  const esperada = claveAplicacion(claveB64url)
  const actual = new Uint8Array(usada)
  if (actual.length !== esperada.length) return false
  for (let i = 0; i < actual.length; i++) if (actual[i] !== esperada[i]) return false
  return true
}
