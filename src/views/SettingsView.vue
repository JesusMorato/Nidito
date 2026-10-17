<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSession } from '../composables/useSession'
import { useConfirm } from '../composables/useConfirm'
import { useToast } from '../composables/useToast'
import UiIcon from '../components/UiIcon.vue'

const router = useRouter()
const { state, me, partner, signOut, renameHousehold, renameMe } = useSession()
const { confirm } = useConfirm()
const { toast } = useToast()

const householdName = ref(state.household?.name ?? '')
const myName = ref(me.value?.display_name ?? '')
watch(me, (m) => { if (m) myName.value = m.display_name })

const err = ref<string | null>(null)

async function run(fn: () => Promise<void>, okMsg: string) {
  err.value = null
  try {
    await fn()
    toast(okMsg)
  } catch (e) {
    err.value = (e as Error).message
  }
}

async function copyCode() {
  const code = state.household?.invite_code
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
    toast('Código copiado')
  } catch {
    toast('No se ha podido copiar; cópialo a mano')
  }
}

async function logout() {
  if (await confirm({ title: 'Cerrar sesión', message: '¿Salir de Nidito en este aparato?', confirmLabel: 'Salir', danger: false })) {
    await signOut()
    router.push({ name: 'login' })
  }
}
</script>

<template>
  <div class="space-yo stack">
    <h1>Ajustes</h1>
    <p v-if="err" class="error">{{ err }}</p>

    <div class="card">
      <h2>Tú</h2>
      <div class="field" style="margin-top: 0.6rem">
        <label for="myname">Tu nombre (como te ve tu pareja)</label>
        <div class="row">
          <input id="myname" v-model="myName" maxlength="40" class="grow" />
          <button type="button" class="small" :disabled="!myName.trim() || myName.trim() === me?.display_name" @click="run(() => renameMe(myName), 'Nombre actualizado')">Guardar</button>
        </div>
      </div>
      <div class="tiny">Sesión: {{ state.user?.email }}</div>
    </div>

    <div class="card space-pareja">
      <h2>Hogar</h2>
      <div class="field" style="margin-top: 0.6rem">
        <label for="hname">Nombre del hogar</label>
        <div class="row">
          <input id="hname" v-model="householdName" maxlength="60" class="grow" />
          <button type="button" class="small" :disabled="!householdName.trim() || householdName.trim() === state.household?.name" @click="run(() => renameHousehold(householdName), 'Hogar renombrado')">Guardar</button>
        </div>
      </div>

      <div v-if="partner" class="field">
        <label>Tu pareja</label>
        <div class="row"><span class="avatar">{{ partner.display_name.slice(0, 1).toUpperCase() }}</span> {{ partner.display_name }}</div>
      </div>
      <div v-else class="field">
        <label>Código de invitación</label>
        <div class="row">
          <span class="code-invite">{{ state.household?.invite_code }}</span>
          <button type="button" class="icon" aria-label="Copiar código" title="Copiar" @click="copyCode"><UiIcon name="copy" /></button>
        </div>
        <p class="help">Pásaselo a tu pareja: en su primera entrada elegirá “Unirme con código”.</p>
      </div>
    </div>

    <div class="card">
      <h2>Criterios y aspectos</h2>
      <p class="tiny" style="margin: 0.3rem 0 0">Llegan en las fases 2 y 3: los aspectos que puntuáis y vuestros imprescindibles (precio máximo, zonas, m²…).</p>
    </div>

    <div class="row" style="justify-content: flex-end; margin-top: 0.5rem">
      <button type="button" class="ghost" @click="logout"><UiIcon name="logout" /> Cerrar sesión</button>
    </div>
  </div>
</template>
