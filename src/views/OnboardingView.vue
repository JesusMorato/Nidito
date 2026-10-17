<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabase'
import { useSession } from '../composables/useSession'
import SegmentedControl from '../components/SegmentedControl.vue'

const router = useRouter()
const { state, refresh } = useSession()

// Si el hogar aparece mientras estamos aquí (carga tardía), salimos solos.
watch(() => state.household, (h) => { if (h) router.replace({ name: 'map' }) }, { immediate: true })

type Mode = 'create' | 'join'
const mode = ref<Mode>('create')
const modes: Array<{ value: Mode; label: string }> = [
  { value: 'create', label: 'Crear hogar' },
  { value: 'join', label: 'Unirme con código' },
]
const displayName = ref(state.user?.user_metadata?.full_name?.split(' ')[0] ?? '')
const householdName = ref('')
const code = ref('')
const busy = ref(false)
const error = ref<string | null>(null)

async function submit() {
  busy.value = true
  error.value = null
  const fn = mode.value === 'create' ? 'create_household' : 'join_household'
  const args =
    mode.value === 'create'
      ? { p_name: householdName.value, p_display_name: displayName.value }
      : { p_code: code.value, p_display_name: displayName.value }
  const { error: e } = await supabase.rpc(fn, args)
  busy.value = false
  if (e) {
    error.value = e.message
    return
  }
  await refresh()
  router.push({ name: 'map' })
}
</script>

<template>
  <div class="space-yo auth-card card">
    <h1>Casi listo</h1>
    <p class="muted">
      Un hogar es la pareja: dos personas, nada más. El primero lo crea y el segundo se une con el código.
    </p>

    <div class="field"><SegmentedControl v-model="mode" :options="modes" /></div>

    <form @submit.prevent="submit">
      <div class="field">
        <label for="dn">Tu nombre (como te verá tu pareja)</label>
        <input id="dn" v-model="displayName" required maxlength="40" />
      </div>

      <div v-if="mode === 'create'" class="field">
        <label for="hn">Nombre del hogar</label>
        <input id="hn" v-model="householdName" placeholder="Ana y Luis buscan casa" required maxlength="60" />
      </div>
      <div v-else class="field">
        <label for="code">Código de invitación</label>
        <input id="code" v-model="code" placeholder="AB12CD34" required style="text-transform: uppercase" />
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" class="block" :disabled="busy">{{ mode === 'create' ? 'Crear hogar' : 'Unirme' }}</button>
    </form>
  </div>
</template>
