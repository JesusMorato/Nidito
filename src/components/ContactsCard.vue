<script setup lang="ts">
// Contactos con la inmobiliaria: quién llamó, cuándo, qué dijo y el próximo paso.
import { computed, ref } from 'vue'
import { useSession } from '../composables/useSession'
import { useData } from '../composables/useData'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import { formatDate } from '../lib/format'
import { CONTACT_KINDS, type ContactEntry, type Property } from '../types'
import Sheet from './Sheet.vue'
import UiIcon from './UiIcon.vue'

const props = defineProps<{ property: Property }>()
const { state: session, nameOf } = useSession()
const data = useData()
const { toast } = useToast()
const { confirm } = useConfirm()

const entries = computed(() => data.contactsOf(props.property.id))
const nextStep = computed(() => entries.value.find((e) => e.next_step)?.next_step ?? null)
const open = ref(false)
const kind = ref<ContactEntry['kind']>('llamada')
const note = ref('')
const next = ref('')

async function save() {
  if (!session.user || (!note.value.trim() && !next.value.trim())) return
  try {
    await data.addContact(props.property, session.user.id, { kind: kind.value, note: note.value.trim() || null, next_step: next.value.trim() || null })
    open.value = false
    note.value = ''
    next.value = ''
  } catch (e) {
    toast(`No se ha podido guardar: ${(e as Error).message}`)
  }
}
async function remove(e: ContactEntry) {
  if (await confirm({ title: 'Borrar', message: '¿Borrar esta anotación?' })) await data.deleteContact(e.id).catch((err) => toast((err as Error).message))
}
const kindLabel = (k: ContactEntry['kind']) => CONTACT_KINDS.find((x) => x.value === k)?.label ?? k
</script>

<template>
  <div class="card">
    <div class="section-title" style="margin-top: 0">
      <h2>Contactos con la inmobiliaria</h2>
      <button type="button" class="small secondary" @click="open = true">+ Anotar</button>
    </div>
    <p v-if="nextStep" class="tag warn" style="margin-bottom: 0.5rem">Próximo paso: {{ nextStep }}</p>
    <ul v-if="entries.length" class="list">
      <li v-for="e in entries" :key="e.id" style="align-items: flex-start">
        <div class="grow">
          <div class="tiny">{{ formatDate(e.happened_at) }} · {{ kindLabel(e.kind) }} · {{ nameOf(e.user_id) }}</div>
          <div v-if="e.note" style="white-space: pre-wrap">{{ e.note }}</div>
          <div v-if="e.next_step" class="tiny">→ {{ e.next_step }}</div>
        </div>
        <button v-if="e.user_id === session.user?.id" type="button" class="icon" aria-label="Borrar" @click="remove(e)"><UiIcon name="trash" :size="18" /></button>
      </li>
    </ul>
    <p v-else class="tiny">Nada anotado. Evita el "¿tú le llamaste?".</p>

    <Sheet v-if="open" title="Anotar contacto" @close="open = false">
      <div class="field">
        <div class="chips">
          <button v-for="k in CONTACT_KINDS" :key="k.value" type="button" class="chip" :class="{ active: kind === k.value }" @click="kind = k.value">{{ k.label }}</button>
        </div>
      </div>
      <div class="field"><label for="ct-note">Qué ha pasado</label><textarea id="ct-note" v-model="note" rows="3" placeholder="Hablé con Marta: aceptan ofertas a partir de 360.000" /></div>
      <div class="field"><label for="ct-next">Próximo paso</label><input id="ct-next" v-model="next" placeholder="Llamar el lunes para la visita" /></div>
      <div class="row" style="justify-content: flex-end"><button type="button" @click="save">Guardar</button></div>
    </Sheet>
  </div>
</template>
