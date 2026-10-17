<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabase'
import { useSession } from '../composables/useSession'
import Logo from '../components/Logo.vue'

const router = useRouter()
const { state, endRecovery } = useSession()
const password = ref('')
const repeat = ref('')
const busy = ref(false)
const error = ref<string | null>(null)

async function submit() {
  error.value = null
  if (password.value.length < 8) {
    error.value = 'La contraseña tiene que tener al menos 8 caracteres.'
    return
  }
  if (password.value !== repeat.value) {
    error.value = 'Las dos contraseñas no coinciden.'
    return
  }
  busy.value = true
  const { error: e } = await supabase.auth.updateUser({ password: password.value })
  busy.value = false
  if (e) {
    error.value = e.message
    return
  }
  endRecovery()
  router.push({ name: state.household ? 'map' : 'onboarding' })
}
</script>

<template>
  <div class="space-yo auth-card card">
    <div style="margin-bottom: 0.4rem"><Logo :size="56" /></div>
    <h1>Nueva contraseña</h1>
    <p class="muted">Elige la contraseña nueva para {{ state.user?.email }}.</p>
    <form @submit.prevent="submit">
      <div class="field">
        <label for="np1">Contraseña nueva</label>
        <input id="np1" v-model="password" type="password" autocomplete="new-password" minlength="8" required />
      </div>
      <div class="field">
        <label for="np2">Repítela</label>
        <input id="np2" v-model="repeat" type="password" autocomplete="new-password" minlength="8" required />
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" class="block" :disabled="busy">Guardar contraseña</button>
    </form>
  </div>
</template>
