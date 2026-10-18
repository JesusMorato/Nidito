// Apoyo para funcionar sin conexión: estado de la red y copia local de los datos.
// La copia vive en localStorage con una clave por usuario (y hogar), y solo se usa
// cuando no se puede pedir nada al servidor. Al cerrar sesión se borran todas: lo que
// uno ve a ciegas no lo carga el otro.
import { ref } from 'vue'

export const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => (online.value = true))
  window.addEventListener('offline', () => (online.value = false))
}

const PREFIX = 'nidito:copia:'

export function saveSnapshot(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value }))
  } catch {
    // Sin espacio o modo privado: seguimos sin copia.
  }
}

export function loadSnapshot<T>(key: string): { at: number; value: T } | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as { at: number; value: T }) : null
  } catch {
    return null
  }
}

export function clearSnapshots() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k)
  } catch {
    // nada
  }
}

/** true si el error parece de red (sin conexión, servidor inalcanzable). */
export function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '')
  return !online.value || /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(msg)
}
