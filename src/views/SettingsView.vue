<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSession } from '../composables/useSession'
import { useData } from '../composables/useData'
import { useConfirm } from '../composables/useConfirm'
import { useToast } from '../composables/useToast'
import { usePush } from '../composables/usePush'
import type { Aspect } from '../types'
import UiIcon from '../components/UiIcon.vue'
import Sheet from '../components/Sheet.vue'

const router = useRouter()
const { state, me, partner, signOut, renameHousehold, renameMe, refresh } = useSession()
const data = useData()
const { confirm } = useConfirm()
const { toast } = useToast()
const push = usePush()

onMounted(() => {
  data.ensureLoaded(state.household?.id)
  push.comprobar()
})

const householdName = ref(state.household?.name ?? '')
const myName = ref(me.value?.display_name ?? '')
watch(me, (m) => { if (m) myName.value = m.display_name })

const err = ref<string | null>(null)
async function run(fn: () => Promise<void>, okMsg: string) {
  err.value = null
  try {
    await fn()
    if (okMsg) toast(okMsg)
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

// --- valoraciones ---
const blind = computed(() => state.household?.blind_rating !== false)
async function toggleBlind() {
  if (!state.household) return
  await run(async () => {
    await data.setBlindRating(state.household!.id, !blind.value)
    await refresh()
  }, blind.value ? 'Modo a ciegas apagado' : 'Modo a ciegas encendido')
}

const aspectOpen = ref(false)
const aspectEditing = ref<Aspect | null>(null)
const aspectName = ref('')
function openAspect(a?: Aspect) {
  aspectEditing.value = a ?? null
  aspectName.value = a?.name ?? ''
  aspectOpen.value = true
}
async function saveAspect() {
  const name = aspectName.value.trim()
  if (!name || !state.household) return
  const editing = aspectEditing.value
  aspectOpen.value = false
  await run(() => (editing ? data.updateAspect(editing.id, { name }) : data.addAspect(state.household!.id, name)), 'Aspecto guardado')
}
async function removeAspect(a: Aspect) {
  const used = data.ratings.value.some((r) => r.aspect_id === a.id)
  if (used) {
    // Con estrellas puestas no se borra: se desactiva y deja de contar.
    await run(() => data.updateAspect(a.id, { active: !a.active }), a.active ? 'Aspecto desactivado' : 'Aspecto activado')
    return
  }
  if (await confirm({ title: 'Borrar aspecto', message: `¿Borrar "${a.name}"?` })) await run(() => data.deleteAspect(a.id), 'Aspecto borrado')
}

// --- avisos ---
const pushTest = ref<string | null>(null)
async function testPush() {
  pushTest.value = 'Enviando…'
  try {
    const r = (await data.testPush()) as { claves?: boolean; aparatos?: number; resultados?: Array<{ aparato: string; codigo: number; detalle: string }> }
    if (!r?.claves) pushTest.value = 'La función no tiene las claves VAPID (ver docs/AVISOS.md).'
    else if (!r.aparatos) pushTest.value = 'No hay ningún aparato apuntado para ti.'
    else pushTest.value = (r.resultados ?? []).map((x) => `${x.aparato}: ${x.codigo >= 200 && x.codigo < 300 ? 'enviado' : `error ${x.codigo} ${x.detalle}`}`).join(' · ')
  } catch (e) {
    pushTest.value = `No se ha podido probar: ${(e as Error).message}`
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
      <div class="section-title" style="margin-top: 0">
        <h2>Aspectos que valoráis</h2>
        <button type="button" class="small secondary" @click="openAspect()">+ Nuevo</button>
      </div>
      <ul class="list">
        <li v-for="a in data.aspects.value" :key="a.id" :class="{ inactive: !a.active }">
          <span class="grow" :style="a.active ? '' : 'color: var(--ink-3); text-decoration: line-through'">{{ a.name }}</span>
          <div class="actions">
            <button type="button" class="icon" aria-label="Subir" @click="data.moveAspect(a.id, -1)"><UiIcon name="chevronUp" :size="18" /></button>
            <button type="button" class="icon" aria-label="Bajar" @click="data.moveAspect(a.id, 1)"><UiIcon name="chevronDown" :size="18" /></button>
            <button type="button" class="icon" aria-label="Editar" @click="openAspect(a)"><UiIcon name="pencil" :size="18" /></button>
            <button type="button" class="icon" :aria-label="a.active ? 'Quitar' : 'Activar'" @click="removeAspect(a)"><UiIcon :name="a.active ? 'trash' : 'check'" :size="18" /></button>
          </div>
        </li>
      </ul>
      <p class="help">Los dos puntuáis los mismos aspectos de 1 a 5 estrellas. Un aspecto con estrellas puestas no se borra: se desactiva y deja de contar.</p>
      <hr class="sep" />
      <label class="check">
        <input type="checkbox" :checked="blind" @change="toggleBlind" />
        Valoración a ciegas: no ves las estrellas del otro hasta haber puesto las tuyas
      </label>
    </div>

    <div class="card">
      <h2>Avisos en el móvil</h2>
      <p class="tiny" style="margin: 0.3rem 0 0.6rem">Cuando tu pareja añada una casa, la valore o comente, te llega un aviso.</p>
      <template v-if="push.situacion.value.disponible">
        <div class="row">
          <span class="grow">{{ push.estado.activo ? 'Activados en este aparato' : 'Desactivados en este aparato' }}</span>
          <button
            type="button"
            class="small"
            :class="push.estado.activo ? 'secondary' : ''"
            :disabled="push.estado.ocupado || !state.household || !state.user"
            @click="push.estado.activo ? push.desactivar() : push.activar(state.household!.id, state.user!.id)"
          >{{ push.estado.activo ? 'Desactivar' : 'Activar' }}</button>
        </div>
        <div v-if="push.estado.activo" class="row" style="margin-top: 0.5rem">
          <button type="button" class="ghost small" @click="push.probar()">Ver un aviso de ejemplo</button>
          <button type="button" class="ghost small" @click="testPush">Probar el envío</button>
        </div>
        <p v-if="pushTest" class="tiny">{{ pushTest }}</p>
        <p v-if="push.estado.error" class="error">{{ push.estado.error }}</p>
      </template>
      <p v-else class="tiny">{{ push.situacion.value.texto }}</p>
    </div>

    <div class="row" style="justify-content: flex-end; margin-top: 0.5rem">
      <button type="button" class="ghost" @click="logout"><UiIcon name="logout" /> Cerrar sesión</button>
    </div>

    <Sheet v-if="aspectOpen" :title="aspectEditing ? 'Editar aspecto' : 'Nuevo aspecto'" @close="aspectOpen = false">
      <form @submit.prevent="saveAspect">
        <div class="field"><label for="asp">Nombre</label><input id="asp" v-model="aspectName" maxlength="40" required placeholder="Terraza, vistas, colegios…" /></div>
        <div class="row" style="justify-content: flex-end"><button type="submit">Guardar</button></div>
      </form>
    </Sheet>
  </div>
</template>
