<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase, supabaseUrl, supabaseAnonKey, authRedirectUrl, oauthError } from '../supabase'
import { googleEnabled } from '../lib/authError'
import { useSession, whenSessionSettled } from '../composables/useSession'
import Logo from '../components/Logo.vue'

// El botón de Google sale solo si está activado en Supabase
// (ver docs/CONFIGURACION-MANUAL.md). Se pregunta al cargar la pantalla.
const googleLogin = ref(false)

const router = useRouter()
const { requestPasswordReset } = useSession()
const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref<string | null>(oauthError ? translate(oauthError) : null)
const forgot = ref(false)
const sent = ref(false)

onMounted(async () => {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabaseAnonKey } })
    googleLogin.value = res.ok && googleEnabled(await res.json())
  } catch {
    // Sin conexión: se queda solo el login con email.
  }
})

async function sendReset() {
  error.value = null
  if (!email.value.trim()) {
    error.value = 'Escribe tu email arriba y vuelve a pulsar.'
    return
  }
  busy.value = true
  try {
    await requestPasswordReset(email.value)
    sent.value = true
  } catch (e) {
    error.value = translate((e as Error).message)
  } finally {
    busy.value = false
  }
}

function translate(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.'
  if (/signups? not allowed/i.test(msg)) return 'Esta app es privada: tu cuenta no está dada de alta.'
  if (/email not confirmed/i.test(msg)) return 'Tienes que confirmar el email antes de entrar.'
  return msg
}

async function loginEmail() {
  busy.value = true
  error.value = null
  const { error: e } = await supabase.auth.signInWithPassword({ email: email.value, password: password.value })
  busy.value = false
  if (e) {
    error.value = translate(e.message)
    return
  }
  await whenSessionSettled()
  router.push({ name: 'map' })
}

async function loginGoogle() {
  busy.value = true
  error.value = null
  const { error: e } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: authRedirectUrl },
  })
  if (e) {
    busy.value = false
    error.value = translate(e.message)
  }
}
</script>

<template>
  <div class="space-yo auth-card card">
    <div style="margin-bottom: 0.4rem"><Logo :size="72" /></div>
    <h1>Entrar en Nidito</h1>
    <p class="muted">Las casas que os interesan, en un mapa y valoradas a dos. Solo pueden entrar las cuentas dadas de alta.</p>

    <form @submit.prevent="loginEmail">
      <div class="field">
        <label for="email">Email</label>
        <input id="email" v-model="email" type="email" autocomplete="email" required />
      </div>
      <div class="field">
        <label for="password">Contraseña</label>
        <input id="password" v-model="password" type="password" autocomplete="current-password" required />
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" class="block" :disabled="busy">Entrar</button>
    </form>

    <div style="margin-top: 0.8rem; text-align: center">
      <button v-if="!forgot" type="button" class="ghost small" @click="forgot = true">¿Has olvidado la contraseña?</button>
      <template v-else-if="!sent">
        <p class="tiny" style="margin-bottom: 0.4rem">Te enviamos un enlace al email de arriba. Ábrelo en este mismo dispositivo.</p>
        <button type="button" class="secondary small" :disabled="busy" @click="sendReset">Enviar enlace</button>
      </template>
      <p v-else class="ok">Enlace enviado. Revisa el correo (y la carpeta de spam).</p>
    </div>

    <template v-if="googleLogin">
      <div class="row" style="margin: 1rem 0; justify-content: center"><span class="tiny">o</span></div>
      <button type="button" class="secondary block" :disabled="busy" @click="loginGoogle">Entrar con Google</button>
    </template>
  </div>
</template>
