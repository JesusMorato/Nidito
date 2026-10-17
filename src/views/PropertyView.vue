<script setup lang="ts">
// Ficha de una casa: datos, fotos, mapa, origen, historial de precio y acciones.
// La fase 2 añade aquí las valoraciones y los comentarios (RatingsPanel).
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useSession } from '../composables/useSession'
import { useData } from '../composables/useData'
import { useEditor } from '../composables/useEditor'
import { useConfirm } from '../composables/useConfirm'
import { useToast } from '../composables/useToast'
import { formatDate, formatEur, formatM2, pricePerM2 } from '../lib/format'
import { EXTRA_KEYS, PROPERTY_TYPES, SOURCE_LABELS, type Photo, type PropertyStatus } from '../types'
import { STATUS_COLOR } from '../lib/status'
import { pinIcon } from '../lib/mapPins'
import StatusChip from '../components/StatusChip.vue'
import StatusPicker from '../components/StatusPicker.vue'
import PhotoStrip from '../components/PhotoStrip.vue'
import RatingsPanel from '../components/RatingsPanel.vue'
import UiIcon from '../components/UiIcon.vue'

const route = useRoute()
const router = useRouter()
const { state: session, nameOf } = useSession()
const data = useData()
const editor = useEditor()
const { confirm } = useConfirm()
const { toast } = useToast()

onMounted(() => data.ensureLoaded(session.household?.id))

const id = computed(() => String(route.params.id))
const p = computed(() => data.byId.value[id.value] ?? null)
const photos = computed(() => (p.value ? data.photosOf(p.value.id) : []))
const prices = computed(() => (p.value ? data.pricesOf(p.value.id) : []))
const ppm2 = computed(() => (p.value ? pricePerM2(p.value.price, p.value.m2) : null))
const typeLabel = computed(() => PROPERTY_TYPES.find((t) => t.value === p.value?.type)?.label ?? '')
const extrasOn = computed(() => EXTRA_KEYS.filter((x) => p.value?.extras?.[x.key] === true).map((x) => x.label))
const extrasOff = computed(() => EXTRA_KEYS.filter((x) => p.value?.extras?.[x.key] === false).map((x) => x.label))

const statusOpen = ref(false)
async function pickStatus(s: PropertyStatus) {
  statusOpen.value = false
  if (!p.value || p.value.status === s) return
  try {
    await data.setStatus(p.value.id, s)
    toast('Estado actualizado')
  } catch (e) {
    toast(`No se ha podido cambiar: ${(e as Error).message}`)
  }
}

// --- fotos ---
const uploading = ref(false)
const viewing = ref<Photo | null>(null)
async function addPhotos(files: File[]) {
  if (!p.value || !session.user) return
  uploading.value = true
  try {
    for (const f of files) await data.uploadPhoto(p.value, f, session.user.id)
    toast(files.length === 1 ? 'Foto subida' : `${files.length} fotos subidas`)
  } catch (e) {
    toast(`No se ha podido subir: ${(e as Error).message}`)
  } finally {
    uploading.value = false
  }
}
async function removePhoto(photo: Photo) {
  if (await confirm({ title: 'Borrar foto', message: 'Se borra para los dos.' })) {
    try {
      await data.deletePhoto(photo)
    } catch (e) {
      toast(`No se ha podido borrar: ${(e as Error).message}`)
    }
  }
}

// --- mapa pequeño ---
const mapEl = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
function drawMap() {
  if (!mapEl.value || !p.value || p.value.lat == null || p.value.lng == null) return
  if (!map) {
    map = L.map(mapEl.value, { zoomControl: false, dragging: false, scrollWheelZoom: false, touchZoom: false, doubleClickZoom: false }).setView([p.value.lat, p.value.lng], 15)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map)
  }
  map.eachLayer((l) => { if (l instanceof L.Marker) l.remove() })
  L.marker([p.value.lat, p.value.lng], { icon: pinIcon('', STATUS_COLOR[p.value.status]) }).addTo(map)
  map.setView([p.value.lat, p.value.lng], 15)
  setTimeout(() => map?.invalidateSize(), 50)
}
watch([p, mapEl], () => drawMap(), { flush: 'post' })
onMounted(() => drawMap())
onBeforeUnmount(() => { map?.remove(); map = null })

function openMaps() {
  if (!p.value?.lat) return
  window.open(`https://www.google.com/maps/search/?api=1&query=${p.value.lat},${p.value.lng}`, '_blank', 'noopener')
}

async function remove() {
  if (!p.value) return
  if (await confirm({ title: 'Borrar casa', message: `Se borra "${p.value.title}" con sus fotos, valoraciones y comentarios, para los dos.` })) {
    try {
      await data.deleteProperty(p.value.id)
      toast('Casa borrada')
      router.replace({ name: 'list' })
    } catch (e) {
      toast(`No se ha podido borrar: ${(e as Error).message}`)
    }
  }
}
</script>

<template>
  <div v-if="!p" class="space-yo">
    <p v-if="!data.state.loadedFor" class="muted">Cargando…</p>
    <div v-else class="card"><p class="muted">Esta casa ya no existe.</p><router-link :to="{ name: 'list' }">Volver a la lista</router-link></div>
  </div>

  <div v-else class="space-yo stack prop">
    <button type="button" class="ghost small back-link" @click="router.back()"><UiIcon name="chevronLeft" :size="18" /> Volver</button>

    <div class="card">
      <div class="row between" style="align-items: flex-start">
        <div class="grow">
          <div class="hero-number">{{ p.price != null ? formatEur(p.price) : 'Sin precio' }}</div>
          <h1 style="font-size: 1.2rem; margin-top: 0.2rem">{{ p.title }}</h1>
          <div class="muted">{{ [p.address, p.neighborhood].filter(Boolean).join(' · ') || 'Sin dirección' }}</div>
        </div>
        <button type="button" class="status-btn" @click="statusOpen = true"><StatusChip :status="p.status" /><UiIcon name="chevronDown" :size="14" /></button>
      </div>
      <div class="kpis" style="margin-top: 0.8rem">
        <div class="kpi"><div class="label">Metros</div><div class="value">{{ p.m2 != null ? formatM2(p.m2) : '—' }}<small v-if="p.m2_useful" class="tiny"> · {{ p.m2_useful }} útiles</small></div></div>
        <div class="kpi"><div class="label">€/m²</div><div class="value">{{ ppm2 ? ppm2.toLocaleString('es-ES') : '—' }}</div></div>
        <div class="kpi"><div class="label">Habitaciones</div><div class="value">{{ p.rooms ?? '—' }}</div></div>
        <div class="kpi"><div class="label">Baños</div><div class="value">{{ p.baths ?? '—' }}</div></div>
      </div>
      <div class="row" style="margin-top: 0.7rem; gap: 0.35rem">
        <span class="tag muted">{{ typeLabel }}</span>
        <span v-if="p.floor" class="tag muted">Planta {{ p.floor }}</span>
        <span v-if="p.exterior != null" class="tag muted">{{ p.exterior ? 'Exterior' : 'Interior' }}</span>
        <span v-for="x in extrasOn" :key="x" class="tag">{{ x }}</span>
        <span v-for="x in extrasOff" :key="'no' + x" class="tag neg">Sin {{ x.toLowerCase() }}</span>
        <span v-if="p.extras?.orientacion" class="tag muted">Orientación {{ p.extras.orientacion }}</span>
        <span v-if="p.extras?.certificado" class="tag muted">Energía {{ p.extras.certificado }}</span>
      </div>
    </div>

    <div class="card">
      <h2>Fotos</h2>
      <PhotoStrip :photos="photos" :url-of="data.photoUrl" :busy="uploading" style="margin-top: 0.6rem" @add="addPhotos" @remove="removePhoto" @open="viewing = $event" />
    </div>

    <RatingsPanel :property="p" />

    <div v-if="p.lat != null" class="card" style="padding: 0; overflow: hidden">
      <div ref="mapEl" class="prop-map" />
      <div class="row between" style="padding: 0.6rem 1rem">
        <span class="tiny">{{ p.address ?? 'Pin en el mapa' }}</span>
        <button type="button" class="ghost small" @click="openMaps">Abrir en Google Maps</button>
      </div>
    </div>

    <div v-if="p.community_fee != null || p.ibi != null || p.notes" class="card">
      <h2>Gastos y notas</h2>
      <div class="kpis" style="margin-top: 0.6rem">
        <div v-if="p.community_fee != null" class="kpi"><div class="label">Comunidad</div><div class="value">{{ formatEur(p.community_fee) }}/mes</div></div>
        <div v-if="p.ibi != null" class="kpi"><div class="label">IBI</div><div class="value">{{ formatEur(p.ibi) }}/año</div></div>
      </div>
      <p v-if="p.notes" class="muted" style="margin: 0.6rem 0 0; white-space: pre-wrap">{{ p.notes }}</p>
    </div>

    <div class="card">
      <h2>Origen</h2>
      <ul class="list" style="margin-top: 0.4rem">
        <li><span class="grow">Llegó <strong>{{ SOURCE_LABELS[p.source].toLowerCase() }}</strong> el {{ formatDate(p.created_at) }}, por {{ nameOf(p.created_by) }}</span></li>
        <li v-if="p.url"><a :href="p.url" target="_blank" rel="noopener" class="grow ellipsis"><UiIcon name="link" :size="16" /> Ver anuncio</a></li>
        <li v-if="p.agency || p.contact"><span class="grow">{{ [p.agency, p.contact].filter(Boolean).join(' · ') }}</span><a v-if="p.contact && /^\+?\d{9,}$/.test(p.contact)" :href="`tel:${p.contact}`" class="btn small secondary">Llamar</a></li>
        <li v-if="p.external_ref"><span class="grow tiny">Ref. {{ p.external_ref }}</span></li>
      </ul>
      <div v-if="prices.length > 1" style="margin-top: 0.6rem">
        <div class="tiny" style="margin-bottom: 0.3rem">Historial de precio</div>
        <ul class="list">
          <li v-for="e in [...prices].reverse()" :key="e.id"><span class="grow">{{ formatDate(e.seen_at) }}</span><span class="num">{{ formatEur(e.price) }}</span></li>
        </ul>
      </div>
    </div>

    <div class="row" style="justify-content: space-between">
      <button type="button" class="danger small" @click="remove"><UiIcon name="trash" :size="16" /> Borrar</button>
      <button type="button" class="secondary" @click="editor.openEdit(p)"><UiIcon name="pencil" :size="16" /> Editar</button>
    </div>

    <StatusPicker v-if="statusOpen" :current="p.status" @pick="pickStatus" @close="statusOpen = false" />
    <div v-if="viewing" class="photo-view" @click="viewing = null"><img :src="data.photoUrl(viewing)" alt="" /></div>
  </div>
</template>

<style>
.prop .back-link { align-self: flex-start; padding-left: 0; }
.prop-map { height: 180px; z-index: 0; }
.status-btn { background: transparent; border-color: transparent; padding: 0.2rem 0.3rem; color: var(--ink-3); gap: 0.2rem; }
</style>
