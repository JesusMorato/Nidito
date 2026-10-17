<script setup lang="ts">
// Mapa con un pin por casa (precio dentro, color del estado). Al tocar un pin sale la tarjeta.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import { useSession } from '../composables/useSession'
import { useData } from '../composables/useData'
import { useFilters } from '../composables/useFilters'
import { useVisible } from '../composables/useVisible'
import { useToast } from '../composables/useToast'
import { formatEurShort } from '../lib/format'
import { MADRID } from '../lib/geo'
import { STATUS_COLOR, scoreColor } from '../lib/status'
import { pinIcon, clusterIcon } from '../lib/mapPins'
import { activeFilterCount } from '../lib/filters'
import type { Property } from '../types'
import { formatScore } from '../lib/ratings'
import PropertyCard from '../components/PropertyCard.vue'
import FilterSheet from '../components/FilterSheet.vue'
import EmptyState from '../components/EmptyState.vue'
import UiIcon from '../components/UiIcon.vue'

const router = useRouter()
const { state: session, partner } = useSession()
const data = useData()
const { state: fs } = useFilters()
const { visible, scores, allNeighborhoods } = useVisible()
const { toast } = useToast()

const mapEl = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let cluster: L.MarkerClusterGroup | null = null
const markers = new Map<string, L.Marker>()
const selected = ref<Property | null>(null)
/** Colorear los pines por estado o por nota conjunta (fase 2). */
const colorBy = ref<'estado' | 'nota'>('estado')
const hasRatings = computed(() => Object.values(scores.value).some((s) => s.joint != null))
const filterCount = computed(() => activeFilterCount(fs.filters))
const withPin = computed(() => visible.value.filter((p) => p.lat != null && p.lng != null))
const withoutPin = computed(() => visible.value.length - withPin.value.length)

function colorOf(p: Property): string {
  return colorBy.value === 'nota' ? scoreColor(scores.value[p.id]?.joint) : STATUS_COLOR[p.status]
}

function draw() {
  if (!map || !cluster) return
  cluster.clearLayers()
  markers.clear()
  for (const p of withPin.value) {
    const label = p.price != null ? formatEurShort(p.price) : '?'
    const m = L.marker([p.lat!, p.lng!], { icon: pinIcon(label, colorOf(p), selected.value?.id === p.id) })
    m.on('click', () => { selected.value = p })
    markers.set(p.id, m)
    cluster.addLayer(m)
  }
}

let fittedOnce = false
function fitAll() {
  if (!map || !withPin.value.length) return
  const b = L.latLngBounds(withPin.value.map((p) => [p.lat!, p.lng!] as [number, number]))
  map.fitBounds(b.pad(0.2), { maxZoom: 15 })
}

onMounted(async () => {
  if (!mapEl.value) return
  map = L.map(mapEl.value, { zoomControl: false }).setView(MADRID, 12)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map)
  cluster = L.markerClusterGroup({
    maxClusterRadius: 44,
    showCoverageOnHover: false,
    iconCreateFunction: (c) => clusterIcon(c.getChildCount()),
  })
  map.addLayer(cluster)
  map.on('click', () => { selected.value = null })
  await data.ensureLoaded(session.household?.id)
  draw()
  if (!fittedOnce && withPin.value.length) {
    fitAll()
    fittedOnce = true
  }
})
onBeforeUnmount(() => { map?.remove(); map = null; cluster = null })

watch([withPin, colorBy, selected], () => draw(), { deep: false })

function locateMe() {
  if (!navigator.geolocation || !map) {
    toast('Tu navegador no da la ubicación')
    return
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      map!.setView([pos.coords.latitude, pos.coords.longitude], 15)
      L.circleMarker([pos.coords.latitude, pos.coords.longitude], { radius: 7, color: 'var(--pareja)', fillColor: 'var(--pareja)', fillOpacity: 0.9 }).addTo(map!)
    },
    () => toast('No se ha podido saber dónde estás'),
    { enableHighAccuracy: true, timeout: 8000 },
  )
}

function openSelected() {
  if (selected.value) router.push({ name: 'property', params: { id: selected.value.id } })
}
const firstPhoto = (p: Property) => data.photosOf(p.id)[0] ?? null
</script>

<template>
  <div class="map-screen space-yo">
    <div ref="mapEl" class="map-el" />

    <div class="map-tools">
      <button type="button" class="map-btn" :aria-label="`Filtros${filterCount ? ' (' + filterCount + ' activos)' : ''}`" @click="fs.open = true">
        <UiIcon name="list" :size="20" />
        <span v-if="filterCount" class="nav-dot" style="position: static; margin-left: 2px">{{ filterCount }}</span>
      </button>
      <button type="button" class="map-btn" aria-label="Ver todas" title="Ver todas" @click="fitAll"><UiIcon name="home" :size="20" /></button>
      <button type="button" class="map-btn" aria-label="Mi ubicación" title="Mi ubicación" @click="locateMe"><UiIcon name="pin" :size="20" /></button>
      <button v-if="hasRatings" type="button" class="map-btn text" @click="colorBy = colorBy === 'estado' ? 'nota' : 'estado'">
        {{ colorBy === 'estado' ? 'Color: estado' : 'Color: nota' }}
      </button>
    </div>

    <div v-if="withoutPin" class="map-note">{{ withoutPin }} {{ withoutPin === 1 ? 'casa sin ubicación no sale' : 'casas sin ubicación no salen' }} en el mapa</div>

    <div v-if="!data.properties.value.length && data.state.loadedFor" class="map-empty">
      <div class="card">
        <EmptyState v-if="partner" kind="casas">
          <strong>Aún no hay casas.</strong><br />
          Pulsa ➕ para añadir la primera: a mano o pegando el texto del anuncio.
        </EmptyState>
        <EmptyState v-else kind="pareja">
          <strong>Invita a tu pareja.</strong><br />
          Código de invitación: <span class="code-invite">{{ session.household?.invite_code }}</span><br />
          <span class="tiny">En su primera entrada elegirá “Unirme con código”. Mientras, puedes ir añadiendo casas.</span>
        </EmptyState>
      </div>
    </div>

    <transition name="slide-up">
      <div v-if="selected" class="map-card" @click="openSelected">
        <PropertyCard :property="selected" :photo="firstPhoto(selected)" :photo-url="firstPhoto(selected) ? data.photoUrl(firstPhoto(selected)!) : ''" :prices="data.pricesOf(selected.id)" compact>
          <template #tags>
            <span v-if="scores[selected.id]?.joint != null" class="tag">★ {{ formatScore(scores[selected.id].joint) }}</span>
          </template>
        </PropertyCard>
      </div>
    </transition>

    <FilterSheet v-if="fs.open" :neighborhoods="allNeighborhoods" :has-ratings="hasRatings" @close="fs.open = false" />
  </div>
</template>

<style>
.map-screen { position: relative; flex: 1; min-height: 0; display: flex; }
.map-el { flex: 1; min-height: 50dvh; z-index: 0; background: var(--surface-2); }
.map-tools { position: absolute; top: 10px; right: 10px; z-index: 5; display: flex; flex-direction: column; gap: 6px; }
.map-btn { width: 42px; height: 42px; padding: 0; border-radius: 12px; background: var(--surface); color: var(--ink); border-color: transparent; box-shadow: var(--shadow); }
.map-btn.text { width: auto; padding: 0 0.7rem; font-size: 0.8rem; }
.map-note { position: absolute; top: 10px; left: 10px; z-index: 5; background: var(--surface); border-radius: 999px; padding: 0.3rem 0.7rem; font-size: 0.75rem; color: var(--ink-2); box-shadow: var(--shadow); max-width: calc(100% - 70px); }
.map-empty { position: absolute; left: 16px; right: 16px; top: 50%; transform: translateY(-50%); z-index: 5; max-width: 420px; margin: 0 auto; }
.map-card { position: absolute; left: 10px; right: 10px; bottom: 10px; z-index: 5; max-width: 560px; margin: 0 auto; cursor: pointer; }
.map-card .pcard { background: var(--surface); box-shadow: var(--shadow); }
.slide-up-enter-active, .slide-up-leave-active { transition: transform 0.2s ease, opacity 0.2s ease; }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(16px); opacity: 0; }

/* pines */
.pin-wrap { background: transparent; border: 0; }
.pin { --pin: var(--casa); position: relative; height: 28px; padding: 0 8px; border-radius: 999px; background: var(--pin); color: #fff; font: 700 12px/28px var(--font-body); text-align: center; white-space: nowrap; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25); border: 2px solid #fff; }
.pin::after { content: ''; position: absolute; left: 50%; bottom: -7px; transform: translateX(-50%); border: 5px solid transparent; border-top: 7px solid var(--pin); border-bottom: 0; }
.pin.selected { transform: scale(1.15); z-index: 10; box-shadow: 0 0 0 3px color-mix(in srgb, var(--pin) 40%, transparent), 0 2px 6px rgba(0, 0, 0, 0.25); }
.pin-cluster { width: 36px; height: 36px; border-radius: 50%; background: var(--ink); color: var(--bg); font: 700 13px/36px var(--font-body); text-align: center; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25); }
.leaflet-container { font-family: var(--font-body); }
.leaflet-control-attribution { font-size: 10px; }
</style>
