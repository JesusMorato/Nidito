<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSession } from './composables/useSession'
import { useToast } from './composables/useToast'
import { configured } from './supabase'
import { online } from './lib/offline'
import ConfirmDialog from './components/ConfirmDialog.vue'
import UiIcon from './components/UiIcon.vue'
import Logo from './components/Logo.vue'

const { state, refresh } = useSession()
const { state: toastState, toast } = useToast()
const route = useRoute()
const router = useRouter()

const inApp = computed(() => !!state.user && !!state.household && !state.recovery)
// El mapa quiere toda la pantalla; las demás vistas van centradas con márgenes.
const fullWidth = computed(() => route.name === 'map')

// Al volver a la app (desbloquear el móvil, cambiar de pestaña) se refresca el hogar.
function onVisible() {
  if (document.visibilityState === 'visible' && inApp.value) refresh()
}
onMounted(() => document.addEventListener('visibilitychange', onVisible))
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible))

// Al llegar desde el email de recuperación, la app manda a "nueva contraseña".
watch(() => state.recovery, (r) => { if (r) router.push({ name: 'new-password' }) })

// El botón ➕ abrirá el alta de casas en la fase 1.
function addHome() {
  toast('Añadir casas llega en la siguiente versión')
}
</script>

<template>
  <!-- Sin .env no hay a dónde conectarse: se explica, en vez de una pantalla en blanco. -->
  <main v-if="!configured" class="container">
    <div class="space-yo auth-card card">
      <div style="margin-bottom: 0.4rem"><Logo :size="72" /></div>
      <h1>Falta conectar Supabase</h1>
      <p class="muted">
        El archivo <code>.env</code> no tiene <code>VITE_SUPABASE_URL</code> ni <code>VITE_SUPABASE_ANON_KEY</code>.
        Los pasos están en <code>docs/CONFIGURACION-MANUAL.md</code>, punto 1.
      </p>
    </div>
  </main>

  <template v-else>
    <header class="topbar space-yo">
      <div class="inner">
        <router-link class="brand" to="/"><Logo :size="28" /><span class="brand-text">Nid<span>ito</span></span></router-link>
        <div v-if="inApp" class="topbar-actions">
          <router-link :to="{ name: 'settings' }" class="btn icon" aria-label="Ajustes" title="Ajustes"><UiIcon name="settings" /></router-link>
        </div>
      </div>
    </header>

    <div v-if="inApp && !online" class="offline-bar" role="status">Sin conexión: no se puede guardar hasta que vuelva.</div>

    <main class="container grow" :class="{ full: fullWidth && inApp }">
      <p v-if="!state.ready" class="muted" style="padding: 16px">Cargando…</p>
      <router-view v-else />
    </main>

    <nav v-if="inApp" class="bottomnav space-yo">
      <div class="inner">
        <router-link :to="{ name: 'map' }">
          <UiIcon name="map" :size="24" />
          Mapa
        </router-link>
        <button type="button" class="fab" aria-label="Añadir casa" @click="addHome">+</button>
        <router-link :to="{ name: 'list' }">
          <UiIcon name="list" :size="24" />
          Lista
        </router-link>
      </div>
    </nav>

    <ConfirmDialog />

    <div v-if="toastState.text" class="toast" role="status">{{ toastState.text }}</div>
  </template>
</template>
