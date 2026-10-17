// Avisos en el móvil: pedir permiso, guardar el aparato y quitarlo.
// Las llamadas a Supabase están en useData.ts; aquí solo se habla con el navegador.
import { computed, reactive } from 'vue'
import { useData } from './useData'
import { claveAplicacion, estadoAvisos, mismaClave, nombreAparato } from '../lib/push'

const estado = reactive({
  /** Este aparato tiene los avisos puestos. */
  activo: false,
  ocupado: false,
  error: null as string | null,
  /** Ya se ha mirado cómo está la cosa (evita parpadeos en Ajustes). */
  comprobado: false,
})

const CLAVE = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

function soportado(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}
function esIos(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}
function instalada(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}
function permisoActual(): NotificationPermission | 'sin-api' {
  return 'Notification' in window ? Notification.permission : 'sin-api'
}

async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null
  } catch {
    return null
  }
}

export function usePush() {
  const data = useData()

  const situacion = computed(() =>
    estadoAvisos({ clave: CLAVE, soportado: soportado(), ios: esIos(), instalada: instalada(), permiso: permisoActual() }),
  )

  /** Mira si este aparato ya está apuntado (en el navegador y en la base de datos). */
  async function comprobar() {
    estado.error = null
    try {
      const reg = await registro()
      const sub = await reg?.pushManager.getSubscription()
      // Un permiso pedido con otra clave ya no sirve: se enseña como desactivado
      // para que al darle a Activar se renueve.
      if (!sub || !mismaClave(sub.options.applicationServerKey, CLAVE)) {
        estado.activo = false
        return
      }
      const apuntados = await data.loadPushSubscriptions()
      estado.activo = apuntados.some((s) => s.endpoint === sub.endpoint)
    } catch {
      estado.activo = false
    } finally {
      estado.comprobado = true
    }
  }

  async function activar(householdId: string, userId: string) {
    if (estado.ocupado) return
    estado.ocupado = true
    estado.error = null
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') {
        estado.error = 'No has dado permiso para los avisos. Puedes volver a intentarlo cuando quieras.'
        return
      }
      const reg = await registro()
      if (!reg) {
        estado.error = 'La app todavía no está guardada en el móvil. Ciérrala, vuelve a abrirla y prueba otra vez.'
        return
      }
      let sub = await reg.pushManager.getSubscription()
      // Si las claves del servidor han cambiado, el permiso viejo no vale: se tira
      // y se pide otro. Si no, los envíos los rechazaría el servicio de avisos.
      if (sub && !mismaClave(sub.options.applicationServerKey, CLAVE)) {
        await data.removePushSubscription(sub.endpoint).catch(() => {})
        await sub.unsubscribe().catch(() => {})
        sub = null
      }
      if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveAplicacion(CLAVE) })
      }
      const claves = sub.toJSON().keys ?? {}
      if (!claves.p256dh || !claves.auth) {
        estado.error = 'El navegador no ha dado las claves del aviso. Prueba a cerrar la app y volver a entrar.'
        return
      }
      await data.savePushSubscription({
        household_id: householdId,
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: claves.p256dh,
        auth: claves.auth,
        aparato: nombreAparato(navigator.userAgent),
      })
      estado.activo = true
    } catch (e) {
      estado.error = (e as Error).message
    } finally {
      estado.ocupado = false
    }
  }

  async function desactivar() {
    if (estado.ocupado) return
    estado.ocupado = true
    estado.error = null
    try {
      const reg = await registro()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await data.removePushSubscription(sub.endpoint)
        await sub.unsubscribe().catch(() => {})
      }
      estado.activo = false
    } catch (e) {
      estado.error = (e as Error).message
    } finally {
      estado.ocupado = false
    }
  }

  /** Enseña un aviso de ejemplo en este mismo aparato, para ver cómo se ve. */
  async function probar() {
    const reg = await registro()
    if (!reg) {
      estado.error = 'La app todavía no está guardada en el móvil.'
      return
    }
    await reg.showNotification('Nueva casa', {
      body: 'Así se verá el aviso cuando tu pareja añada o valore una casa.',
      icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
      badge: `${import.meta.env.BASE_URL}icons/icon-192.png`,
      tag: 'nidito-prueba',
    })
  }

  return { estado, situacion, comprobar, activar, desactivar, probar }
}
