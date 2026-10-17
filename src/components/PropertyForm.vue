<script setup lang="ts">
// Formulario de alta y edición de una casa. Lo abre el editor global (useEditor).
import { computed, reactive, ref } from 'vue'
import type { Extras, Property, PropertyInput, PropertyType } from '../types'
import { EXTRA_KEYS, PROPERTY_TYPES } from '../types'
import type { LatLng } from '../lib/geo'
import Sheet from './Sheet.vue'
import AddressPicker from './AddressPicker.vue'
import SegmentedControl from './SegmentedControl.vue'

const props = defineProps<{ initial: Property | null; prefill: PropertyInput | null; busy: boolean }>()
const emit = defineEmits<{ (e: 'save', input: PropertyInput): void; (e: 'close'): void }>()

const base = props.initial ?? props.prefill ?? { title: '' }
const num = (v: number | null | undefined) => (v == null ? '' : String(v))

const f = reactive({
  title: base.title ?? '',
  price: num(base.price),
  m2: num(base.m2),
  m2_useful: num(base.m2_useful),
  rooms: num(base.rooms),
  baths: num(base.baths),
  floor: base.floor ?? '',
  type: (base.type ?? 'piso') as PropertyType,
  exterior: (base.exterior == null ? 'nd' : base.exterior ? 'si' : 'no') as 'nd' | 'si' | 'no',
  address: base.address ?? null,
  neighborhood: base.neighborhood ?? '',
  point: (base.lat != null && base.lng != null ? { lat: base.lat, lng: base.lng } : null) as LatLng | null,
  extras: { ...(base.extras ?? {}) } as Extras,
  orientacion: base.extras?.orientacion ?? '',
  certificado: base.extras?.certificado ?? '',
  community_fee: num(base.community_fee),
  ibi: num(base.ibi),
  url: base.url ?? '',
  agency: base.agency ?? '',
  contact: base.contact ?? '',
  external_ref: base.external_ref ?? '',
  notes: base.notes ?? '',
})

const exteriorOptions = [
  { value: 'nd' as const, label: 'No sé' },
  { value: 'si' as const, label: 'Exterior' },
  { value: 'no' as const, label: 'Interior' },
]
const error = ref<string | null>(null)
const moreOpen = ref(!!(base.url || base.agency || base.contact || base.community_fee || base.ibi || base.notes))

const title = computed(() => (props.initial ? 'Editar casa' : 'Nueva casa'))

function toggleExtra(k: keyof Extras) {
  const cur = f.extras[k]
  // Tres estados: sin dato → sí → no → sin dato
  if (cur === undefined) (f.extras as Record<string, unknown>)[k] = true
  else if (cur === true) (f.extras as Record<string, unknown>)[k] = false
  else delete (f.extras as Record<string, unknown>)[k]
}
function extraClass(k: keyof Extras) {
  const v = f.extras[k]
  return v === true ? 'active' : v === false ? 'off' : ''
}

const int = (s: string) => (s.trim() === '' ? null : Math.round(Number(s.replace(/\./g, '').replace(',', '.'))))
const dec = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))

function submit() {
  error.value = null
  if (!f.title.trim()) {
    error.value = 'Ponle un título (por ejemplo, "Piso en Fuencarral").'
    return
  }
  const extras: Extras = { ...f.extras }
  if (f.orientacion) extras.orientacion = f.orientacion
  else delete extras.orientacion
  if (f.certificado) extras.certificado = f.certificado.toUpperCase()
  else delete extras.certificado
  const input: PropertyInput = {
    id: props.initial?.id,
    title: f.title.trim(),
    price: int(f.price),
    m2: int(f.m2),
    m2_useful: int(f.m2_useful),
    rooms: int(f.rooms),
    baths: int(f.baths),
    floor: f.floor.trim() || null,
    type: f.type,
    exterior: f.exterior === 'nd' ? null : f.exterior === 'si',
    address: f.address,
    neighborhood: f.neighborhood.trim() || null,
    lat: f.point?.lat ?? null,
    lng: f.point?.lng ?? null,
    extras,
    community_fee: dec(f.community_fee),
    ibi: dec(f.ibi),
    url: f.url.trim() || null,
    agency: f.agency.trim() || null,
    contact: f.contact.trim() || null,
    external_ref: f.external_ref.trim() || null,
    notes: f.notes.trim() || null,
    source: props.initial?.source ?? props.prefill?.source ?? 'manual',
    raw_text: props.prefill?.raw_text ?? undefined,
    status: props.initial?.status,
  }
  emit('save', input)
}
</script>

<template>
  <Sheet :title="title" @close="emit('close')">
    <form class="space-yo" @submit.prevent="submit">
      <div class="field">
        <label for="pf-title">Título</label>
        <input id="pf-title" v-model="f.title" maxlength="120" placeholder="Piso en Fuencarral, 3 hab" required />
      </div>

      <div class="grid2">
        <div class="field">
          <label for="pf-price">Precio (€)</label>
          <input id="pf-price" v-model="f.price" inputmode="numeric" placeholder="385000" />
        </div>
        <div class="field">
          <label for="pf-m2">m² construidos</label>
          <input id="pf-m2" v-model="f.m2" inputmode="numeric" placeholder="92" />
        </div>
      </div>
      <div class="grid2">
        <div class="field">
          <label for="pf-rooms">Habitaciones</label>
          <input id="pf-rooms" v-model="f.rooms" inputmode="numeric" />
        </div>
        <div class="field">
          <label for="pf-baths">Baños</label>
          <input id="pf-baths" v-model="f.baths" inputmode="numeric" />
        </div>
      </div>
      <div class="grid2">
        <div class="field">
          <label for="pf-type">Tipo</label>
          <select id="pf-type" v-model="f.type">
            <option v-for="t in PROPERTY_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
        </div>
        <div class="field">
          <label for="pf-floor">Planta</label>
          <input id="pf-floor" v-model="f.floor" placeholder="4, bajo, ático…" />
        </div>
      </div>
      <div class="field">
        <SegmentedControl v-model="f.exterior" :options="exteriorOptions" small />
      </div>

      <AddressPicker v-model:address="f.address" v-model:point="f.point" />
      <div class="field">
        <label for="pf-nb">Barrio o zona</label>
        <input id="pf-nb" v-model="f.neighborhood" placeholder="Fuencarral" />
      </div>

      <div class="field">
        <label>Extras (toca: sí → no → sin dato)</label>
        <div class="chips">
          <button v-for="x in EXTRA_KEYS" :key="x.key" type="button" class="chip" :class="extraClass(x.key)" @click="toggleExtra(x.key)">
            {{ f.extras[x.key] === false ? 'Sin ' + x.label.toLowerCase() : x.label }}
          </button>
        </div>
      </div>
      <div class="grid2">
        <div class="field">
          <label for="pf-ori">Orientación</label>
          <select id="pf-ori" v-model="f.orientacion">
            <option value="">—</option>
            <option v-for="o in ['norte', 'sur', 'este', 'oeste', 'noreste', 'noroeste', 'sureste', 'suroeste']" :key="o" :value="o">{{ o }}</option>
          </select>
        </div>
        <div class="field">
          <label for="pf-cert">Certificado energético</label>
          <select id="pf-cert" v-model="f.certificado">
            <option value="">—</option>
            <option v-for="c in ['A', 'B', 'C', 'D', 'E', 'F', 'G']" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
      </div>

      <button type="button" class="ghost small" style="margin-bottom: 0.6rem" @click="moreOpen = !moreOpen">
        {{ moreOpen ? 'Menos campos' : 'Más campos: gastos, origen, notas' }}
      </button>
      <template v-if="moreOpen">
        <div class="grid2">
          <div class="field">
            <label for="pf-m2u">m² útiles</label>
            <input id="pf-m2u" v-model="f.m2_useful" inputmode="numeric" />
          </div>
          <div class="field">
            <label for="pf-fee">Comunidad (€/mes)</label>
            <input id="pf-fee" v-model="f.community_fee" inputmode="decimal" />
          </div>
        </div>
        <div class="grid2">
          <div class="field">
            <label for="pf-ibi">IBI (€/año)</label>
            <input id="pf-ibi" v-model="f.ibi" inputmode="decimal" />
          </div>
          <div class="field">
            <label for="pf-ref">Referencia del anuncio</label>
            <input id="pf-ref" v-model="f.external_ref" />
          </div>
        </div>
        <div class="field">
          <label for="pf-url">Enlace al anuncio</label>
          <input id="pf-url" v-model="f.url" type="url" inputmode="url" placeholder="https://…" />
        </div>
        <div class="grid2">
          <div class="field">
            <label for="pf-agency">Inmobiliaria</label>
            <input id="pf-agency" v-model="f.agency" />
          </div>
          <div class="field">
            <label for="pf-contact">Contacto (teléfono o nombre)</label>
            <input id="pf-contact" v-model="f.contact" />
          </div>
        </div>
        <div class="field">
          <label for="pf-notes">Notas</label>
          <textarea id="pf-notes" v-model="f.notes" rows="3" />
        </div>
      </template>

      <p v-if="error" class="error">{{ error }}</p>
      <div class="row" style="justify-content: flex-end; margin-top: 0.5rem">
        <button type="button" class="ghost" @click="emit('close')">Cancelar</button>
        <button type="submit" :disabled="busy">{{ busy ? 'Guardando…' : 'Guardar' }}</button>
      </div>
    </form>
  </Sheet>
</template>
