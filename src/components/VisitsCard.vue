<script setup lang="ts">
// Visitas a una casa: fecha, lista de comprobación, notas y "añadir al calendario".
import { computed, ref } from 'vue'
import { useSession } from '../composables/useSession'
import { useData } from '../composables/useData'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import { VISIT_CHECKLIST, type Property, type Visit } from '../types'
import Sheet from './Sheet.vue'
import UiIcon from './UiIcon.vue'

const props = defineProps<{ property: Property }>()
const { state: session, nameOf } = useSession()
const data = useData()
const { toast } = useToast()
const { confirm } = useConfirm()

const visits = computed(() => data.visitsOf(props.property.id))
const open = ref<Visit | null>(null)
const when = ref('')
const notes = ref('')

function fmt(iso: string | null): string {
  if (!iso) return 'sin fecha'
  return new Date(iso).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function add() {
  if (!session.user) return
  try {
    const v = await data.addVisit(props.property, session.user.id, null)
    edit(v)
  } catch (e) {
    toast(`No se ha podido crear: ${(e as Error).message}`)
  }
}
function edit(v: Visit) {
  open.value = v
  when.value = toLocalInput(v.scheduled_at)
  notes.value = v.notes ?? ''
}
async function save() {
  if (!open.value) return
  try {
    await data.updateVisit(open.value.id, { scheduled_at: when.value ? new Date(when.value).toISOString() : null, notes: notes.value.trim() || null })
    open.value = null
  } catch (e) {
    toast(`No se ha podido guardar: ${(e as Error).message}`)
  }
}
async function toggleCheck(v: Visit, key: string) {
  const cur = v.checklist?.[key]
  const next = { ...(v.checklist ?? {}) }
  if (cur === undefined) next[key] = true
  else if (cur === true) next[key] = false
  else delete next[key]
  await data.updateVisit(v.id, { checklist: next }).catch((e) => toast((e as Error).message))
}
async function toggleDone(v: Visit) {
  await data.updateVisit(v.id, { done: !v.done }).catch((e) => toast((e as Error).message))
}
async function remove(v: Visit) {
  if (await confirm({ title: 'Borrar visita', message: 'Se borra para los dos.' })) {
    await data.deleteVisit(v.id).catch((e) => toast((e as Error).message))
    if (open.value?.id === v.id) open.value = null
  }
}
/** Archivo .ics para añadir la visita al calendario del móvil. */
function calendar(v: Visit) {
  if (!v.scheduled_at) return
  const start = new Date(v.scheduled_at)
  const end = new Date(start.getTime() + 45 * 60_000)
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const where = [props.property.address, props.property.neighborhood].filter(Boolean).join(', ')
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nidito//ES', 'BEGIN:VEVENT', `UID:${v.id}@nidito`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:Visita: ${props.property.title}`, `LOCATION:${where}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'visita.ics'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const problems = (v: Visit) => VISIT_CHECKLIST.filter((c) => v.checklist?.[c.key] === false).map((c) => c.label)
</script>

<template>
  <div class="card">
    <div class="section-title" style="margin-top: 0">
      <h2>Visitas</h2>
      <button type="button" class="small secondary" @click="add">+ Visita</button>
    </div>
    <ul v-if="visits.length" class="list">
      <li v-for="v in visits" :key="v.id" style="align-items: flex-start">
        <button type="button" class="icon" :aria-label="v.done ? 'Hecha' : 'Pendiente'" :style="v.done ? 'color: var(--pos)' : ''" @click="toggleDone(v)"><UiIcon :name="v.done ? 'check' : 'calendar'" :size="20" /></button>
        <div class="grow">
          <div style="font-weight: 600">{{ fmt(v.scheduled_at) }} <span class="tiny">· {{ nameOf(v.created_by) }}</span></div>
          <div v-if="problems(v).length" class="tiny" style="color: var(--neg)">Problemas: {{ problems(v).join(', ') }}</div>
          <div v-if="v.notes" class="tiny" style="white-space: pre-wrap">{{ v.notes }}</div>
        </div>
        <button type="button" class="icon" aria-label="Editar" @click="edit(v)"><UiIcon name="pencil" :size="18" /></button>
      </li>
    </ul>
    <p v-else class="tiny">Sin visitas. Al crear una puedes ponerle fecha, añadirla al calendario y repasar la lista de comprobación durante la visita.</p>

    <Sheet v-if="open" title="Visita" @close="open = null">
      <div class="field"><label for="vis-when">Cuándo</label><input id="vis-when" v-model="when" type="datetime-local" /></div>
      <div class="row" style="margin-bottom: 0.8rem">
        <button type="button" class="ghost small" :disabled="!when" @click="save(); calendar(open!)"><UiIcon name="calendar" :size="16" /> Añadir al calendario</button>
      </div>
      <label>Durante la visita (toca: bien → problema → sin mirar)</label>
      <ul class="list" style="margin-bottom: 0.8rem">
        <li v-for="c in VISIT_CHECKLIST" :key="c.key" style="padding: 0.4rem 0">
          <button type="button" class="chip" :class="open.checklist?.[c.key] === true ? 'active' : open.checklist?.[c.key] === false ? 'off' : ''" style="width: 100%; justify-content: flex-start" @click="toggleCheck(open!, c.key)">
            <UiIcon :name="open.checklist?.[c.key] === true ? 'check' : open.checklist?.[c.key] === false ? 'warn' : 'chevronRight'" :size="16" /> {{ c.label }}
          </button>
        </li>
      </ul>
      <div class="field"><label for="vis-notes">Notas de la visita</label><textarea id="vis-notes" v-model="notes" rows="3" /></div>
      <div class="row" style="justify-content: space-between">
        <button type="button" class="danger small" @click="remove(open!)">Borrar</button>
        <button type="button" @click="save">Guardar</button>
      </div>
    </Sheet>
  </div>
</template>

<style>
.chip.off { background: var(--neg-soft); border-color: var(--neg); color: var(--neg); }
</style>
