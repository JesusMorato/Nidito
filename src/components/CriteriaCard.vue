<script setup lang="ts">
// Criterios del hogar: imprescindibles (deciden si una casa automática entra) y
// preferencias (solo suben la nota de encaje). Se guardan al pulsar y se vuelve a
// calcular el encaje de todas las casas.
import { computed, reactive, ref, watch } from 'vue'
import { useSession } from '../composables/useSession'
import { useData } from '../composables/useData'
import { useToast } from '../composables/useToast'
import { EXTRA_KEYS, PROPERTY_TYPES, type PropertyType } from '../types'

const { state: session } = useSession()
const data = useData()
const { toast } = useToast()

const MUST_KEYS = [{ key: 'exterior', label: 'Exterior' }, ...EXTRA_KEYS.map((x) => ({ key: x.key as string, label: x.label }))]

const f = reactive({
  max_price: '',
  min_m2: '',
  min_rooms: '',
  min_baths: '',
  types: [] as PropertyType[],
  must: {} as Record<string, boolean>,
  prefs: {} as Record<string, number>,
  require_zone: true,
})
const dirty = ref(false)
const busy = ref(false)

watch(
  () => data.criteria.value,
  (c) => {
    if (!c) return
    f.max_price = c.max_price == null ? '' : String(c.max_price)
    f.min_m2 = c.min_m2 == null ? '' : String(c.min_m2)
    f.min_rooms = c.min_rooms == null ? '' : String(c.min_rooms)
    f.min_baths = c.min_baths == null ? '' : String(c.min_baths)
    f.types = [...(c.types ?? [])]
    f.must = { ...(c.must ?? {}) }
    f.prefs = { ...(c.prefs ?? {}) }
    f.require_zone = c.require_zone !== false
    dirty.value = false
  },
  { immediate: true },
)
watch(f, () => { dirty.value = true }, { deep: true })

function toggleType(t: PropertyType) {
  const i = f.types.indexOf(t)
  if (i >= 0) f.types.splice(i, 1)
  else f.types.push(t)
}
function toggleMust(k: string) {
  if (f.must[k]) delete f.must[k]
  else {
    f.must[k] = true
    delete f.prefs[k]
  }
}
/** Preferencia: toca para subir de 1 a 3 puntos y luego quitar. */
function cyclePref(k: string) {
  const cur = f.prefs[k] ?? 0
  if (cur >= 3) delete f.prefs[k]
  else {
    f.prefs[k] = cur + 1
    delete f.must[k]
  }
}
const int = (s: string) => (s.trim() === '' ? null : Math.round(Number(s.replace(/\./g, ''))))
const hasZones = computed(() => data.zones.value.length > 0)

async function save() {
  if (!session.household) return
  busy.value = true
  try {
    await data.saveCriteria(session.household.id, {
      max_price: int(f.max_price),
      min_m2: int(f.min_m2),
      min_rooms: int(f.min_rooms),
      min_baths: int(f.min_baths),
      types: f.types,
      must: f.must,
      prefs: f.prefs,
      require_zone: f.require_zone,
    })
    dirty.value = false
    toast('Criterios guardados y aplicados')
  } catch (e) {
    toast(`No se ha podido guardar: ${(e as Error).message}`)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="card space-pareja">
    <h2>Vuestros criterios</h2>
    <p class="tiny" style="margin: 0.3rem 0 0.6rem">
      Los <strong>imprescindibles</strong> deciden si una casa que llega sola (correo, Idealista) entra o se descarta; con las que metéis vosotros solo avisan.
      Las <strong>preferencias</strong> suman puntos a la nota de encaje.
    </p>
    <div class="grid2">
      <div class="field"><label for="cr-price">Precio máximo (€)</label><input id="cr-price" v-model="f.max_price" inputmode="numeric" placeholder="380000" /></div>
      <div class="field"><label for="cr-m2">m² mínimos</label><input id="cr-m2" v-model="f.min_m2" inputmode="numeric" placeholder="80" /></div>
    </div>
    <div class="grid2">
      <div class="field"><label for="cr-rooms">Habitaciones mínimas</label><input id="cr-rooms" v-model="f.min_rooms" inputmode="numeric" /></div>
      <div class="field"><label for="cr-baths">Baños mínimos</label><input id="cr-baths" v-model="f.min_baths" inputmode="numeric" /></div>
    </div>
    <div class="field">
      <label>Tipos admitidos (ninguno marcado = cualquiera)</label>
      <div class="chips">
        <button v-for="t in PROPERTY_TYPES" :key="t.value" type="button" class="chip" :class="{ active: f.types.includes(t.value) }" @click="toggleType(t.value)">{{ t.label }}</button>
      </div>
    </div>
    <div class="field">
      <label>Imprescindibles</label>
      <div class="chips">
        <button v-for="m in MUST_KEYS" :key="m.key" type="button" class="chip" :class="{ active: !!f.must[m.key] }" @click="toggleMust(m.key)">{{ m.label }}</button>
      </div>
    </div>
    <div class="field">
      <label>Preferencias (toca para dar 1, 2 o 3 puntos)</label>
      <div class="chips">
        <button v-for="m in MUST_KEYS" :key="m.key" type="button" class="chip" :class="{ active: !!f.prefs[m.key] }" :disabled="!!f.must[m.key]" @click="cyclePref(m.key)">
          {{ m.label }}<span v-if="f.prefs[m.key]"> +{{ f.prefs[m.key] }}</span>
        </button>
      </div>
    </div>
    <label class="check field">
      <input v-model="f.require_zone" type="checkbox" />
      Tiene que estar dentro de vuestras zonas{{ hasZones ? '' : ' (aún no habéis dibujado ninguna: en el mapa, botón de zonas)' }}
    </label>
    <div class="row" style="justify-content: flex-end">
      <button type="button" :disabled="busy || !dirty" @click="save">{{ busy ? 'Aplicando…' : 'Guardar y aplicar' }}</button>
    </div>
  </div>
</template>
