import { createRouter, createWebHashHistory } from 'vue-router'
import { useSession, whenSessionSettled } from './composables/useSession'
import LoginView from './views/LoginView.vue'
import OnboardingView from './views/OnboardingView.vue'
import MapView from './views/MapView.vue'
import ListView from './views/ListView.vue'
import SettingsView from './views/SettingsView.vue'
import NewPasswordView from './views/NewPasswordView.vue'

// Modo hash (#/mapa) para que GitHub Pages no tenga que saber de rutas.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/mapa' },
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/empezar', name: 'onboarding', component: OnboardingView, meta: { needsHousehold: false } },
    { path: '/mapa', name: 'map', component: MapView },
    { path: '/lista', name: 'list', component: ListView },
    { path: '/ajustes', name: 'settings', component: SettingsView },
    { path: '/nueva-contrasena', name: 'new-password', component: NewPasswordView, meta: { recovery: true } },
    { path: '/:pathMatch(.*)*', redirect: '/mapa' },
  ],
})

// Espera a que Supabase haya dicho si hay sesión antes de decidir nada.
function waitReady(): Promise<void> {
  const { state } = useSession()
  if (state.ready) return Promise.resolve()
  return new Promise((resolve) => {
    const t = setInterval(() => {
      if (state.ready) {
        clearInterval(t)
        resolve()
      }
    }, 30)
  })
}

router.beforeEach(async (to) => {
  await waitReady()
  // Tras un login, espera a que el hogar esté cargado antes de decidir la ruta.
  await whenSessionSettled()
  const { state } = useSession()

  if (to.meta.public) {
    return state.user ? { name: 'map' } : true
  }
  if (!state.user) return { name: 'login' }

  // Viene del enlace de "olvidé mi contraseña": primero la cambia, luego lo demás.
  if (state.recovery && !to.meta.recovery) return { name: 'new-password' }
  if (to.meta.recovery) return true

  const needsHousehold = to.meta.needsHousehold !== false
  if (needsHousehold && !state.household) return { name: 'onboarding' }
  if (!needsHousehold && state.household) return { name: 'map' }
  return true
})
