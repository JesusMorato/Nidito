<script setup lang="ts">
// Dirección con buscador (CartoCiudad) y pin arrastrable en un mapa pequeño.
// Emite la dirección en texto y el punto (lat, lng) por separado.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { candidateLabel, locateCandidate, reverseGeocode, searchAddress, type AddressCandidate } from '../lib/geocode'
import { MADRID, type LatLng } from '../lib/geo'
import { pinIcon } from '../lib/mapPins'
import UiIcon from './UiIcon.vue'

const props = defineProps<{ address: string | null; point: LatLng | null }>()
const emit = defineEmits<{ (e: 'update:address', v: string | null): void; (e: 'update:point', v: LatLng | null): void }>()

const query = ref(props.address ?? '')
const suggestions = ref<AddressCandidate[]>([])
const searching = ref(false)
const searchError = ref<string | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

watch(() => props.address, (a) => { if ((a ?? '') !== query.value) query.value = a ?? '' })

function onInput() {
  emit('update:address', query.value.trim() || null)
  if (timer) clearTimeout(timer)
  searchError.value = null
  timer = setTimeout(async () => {
    if (query.value.trim().length < 3) {
      suggestions.value = []
      return
    }
    searching.value = true
    try {
      suggestions.value = await searchAddress(query.value)
    } catch (e) {
      searchError.value = (e as Error).message
      suggestions.value = []
    } finally {
      searching.value = false
    }
  }, 350)
}

async function pick(c: AddressCandidate) {
  suggestions.value = []
  try {
    const located = await locateCandidate(c)
    query.value = candidateLabel(located)
    emit('update:address', query.value)
    if (located.point) setPoint(located.point, true)
  } catch (e) {
    searchError.value = (e as Error).message
  }
}

// --- mapa pequeño con el pin ---
const mapEl = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let marker: L.Marker | null = null

function setPoint(p: LatLng, fly = false) {
  emit('update:point', p)
  if (!map) return
  if (!marker) {
    marker = L.marker(p, { draggable: true, icon: pinIcon('', 'var(--casa)') }).addTo(map)
    marker.on('dragend', async () => {
      const ll = marker!.getLatLng()
      emit('update:point', { lat: ll.lat, lng: ll.lng })
      if (!query.value.trim()) {
        const addr = await reverseGeocode({ lat: ll.lat, lng: ll.lng })
        if (addr) {
          query.value = addr
          emit('update:address', addr)
        }
      }
    })
  } else {
    marker.setLatLng(p)
  }
  if (fly) map.setView(p, 16)
}

onMounted(() => {
  if (!mapEl.value) return
  map = L.map(mapEl.value, { zoomControl: false, attributionControl: true }).setView(props.point ?? MADRID, props.point ? 16 : 11)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map)
  map.on('click', (ev: L.LeafletMouseEvent) => setPoint({ lat: ev.latlng.lat, lng: ev.latlng.lng }))
  if (props.point) setPoint(props.point)
  // La hoja se anima al abrirse: el mapa tiene que medirse cuando ya tiene tamaño.
  setTimeout(() => map?.invalidateSize(), 300)
})
onBeforeUnmount(() => { map?.remove(); map = null; marker = null })

function clearPoint() {
  marker?.remove()
  marker = null
  emit('update:point', null)
}
</script>

<template>
  <div class="field">
    <label for="addr">Dirección</label>
    <div class="addr-wrap">
      <input id="addr" v-model="query" placeholder="Calle y número, o barrio" autocomplete="off" @input="onInput" />
      <ul v-if="suggestions.length" class="addr-suggest">
        <li v-for="c in suggestions" :key="c.id + c.type">
          <button type="button" @click="pick(c)"><UiIcon name="pin" :size="16" /> {{ candidateLabel(c) }}</button>
        </li>
      </ul>
    </div>
    <p v-if="searchError" class="help">{{ searchError }}. Puedes poner el pin a mano tocando el mapa.</p>
    <p v-else class="help">{{ searching ? 'Buscando…' : 'Elige una sugerencia o toca el mapa para poner el pin. Se puede arrastrar.' }}</p>
  </div>
  <div class="mini-map-wrap">
    <div ref="mapEl" class="mini-map" />
    <button v-if="point" type="button" class="ghost small mini-map-clear" @click="clearPoint">Quitar pin</button>
  </div>
</template>

<style scoped>
.addr-wrap { position: relative; }
.addr-suggest {
  position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 70; list-style: none; margin: 0; padding: 4px;
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); box-shadow: var(--shadow); max-height: 240px; overflow: auto;
}
.addr-suggest button { width: 100%; justify-content: flex-start; text-align: left; background: transparent; color: var(--ink); border-color: transparent; font-weight: 500; padding: 0.55rem 0.6rem; border-radius: 8px; }
.addr-suggest button:active { background: var(--surface-2); transform: none; }
.mini-map-wrap { position: relative; margin-bottom: 0.85rem; }
.mini-map { height: 220px; border-radius: var(--r-md); overflow: hidden; border: 1px solid var(--line); z-index: 0; }
.mini-map-clear { position: absolute; top: 8px; right: 8px; z-index: 1; background: var(--surface); }
</style>
