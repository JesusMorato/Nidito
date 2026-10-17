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
import { EXTRA_KEYS, PROPERTY_TYPES, SOURCE_LABELS, type Photo, type Property, type PropertyStatus } from '../types'
import { STATUS_COLOR } from '../lib/status'
import { pinIcon } from '../lib/mapPins'
import StatusChip from '../components/StatusChip.vue'
import StatusPicker from '../components/StatusPicker.vue'
import PhotoStrip from '../components/PhotoStrip.vue'
import RatingsPanel from '../components/RatingsPanel.vue'
import FitCard from '../components/FitCard.vue'
import CostCard from '../components/CostCard.vue'
import PlacesDistance from '../components/PlacesDistance.vue'
import VisitsCard from '../components/VisitsCard.vue'
import ContactsCard from '../components/ContactsCard.vue'
import ZoneNotes from '../components/ZoneNotes.vue'
import Sheet from '../components/Sheet.vue'
import { parseListing } from '../lib/parseListing'
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
const zone = computed(() => (p.value?.in_zone ? data.zones.value.find((z) => z.name === p.value!.in_zone) ?? null : null))

// --- duplicados: al abrir la ficha se pregunta a la base de datos si hay otra igual ---
const duplicates = ref<Property[]>([])
const dupOpen = ref(false)
let dupCheckedFor = ''
watch(p, async (val) => {
  if (!val || val.id === dupCheckedFor) return
  dupCheckedFor = val.id
  duplicates.value = await data.findDuplicates(val.id).catch(() => [])
}, { immediate: true })
async function merge(other: Property) {
  if (!p.value) return
  const ok = await confirm({
    title: 'Fusionar casas',
    message: `"${other.title}" pasa a formar parte de "${p.value.title}": fotos, precios, valoraciones y comentarios se juntan, y lo que a esta le falte se coge de la otra.`,
    confirmLabel: 'Fusionar',
    danger: false,
  })
  if (!ok) return
  dupOpen.value = false
  try {
    await data.mergeProperties(p.value.id, other.id)
    duplicates.value = duplicates.value.filter((d) => d.id !== other.id)
    toast('Casas fusionadas')
  } catch (e) {
    toast(`No se ha podido fusionar: ${(e as Error).message}`)
  }
}

/** Enlace compartido o texto pegado sin completar: el lector vuelve a leer el texto guardado. */
function fillFromText() {
  if (!p.value?.raw_text) return
  const parsed = parseListing(p.value.raw_text)
  const merged = { ...parsed, ...Object.fromEntries(Object.entries(p.value).filter(([, v]) => v != null && v !== '')), id: p.value.id, title: p.value.title, extras: { ...(parsed.extras ?? {}), ...(p.value.extras ?? {}) } } as Property
  editor.openEdit(merged)
}
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

    <button v-if="duplicates.length" type="button" class="dup-banner" @click="dupOpen = true">
      <UiIcon name="warn" :size="18" /> Puede que ya la tengáis: {{ duplicates.length }} {{ duplicates.length === 1 ? 'casa parecida' : 'casas parecidas' }}. Toca para comparar.
    </button>

    <div v-if="p.raw_text && (p.m2 == null || p.rooms == null)" class="card flat row between">
      <span class="tiny grow">Esta casa llegó con texto. El lector puede rellenar los datos que faltan.</span>
      <button type="button" class="secondary small" @click="fillFromText">Rellenar desde el texto</button>
    </div>

    <FitCard :property="p" :has-criteria="!!data.criteria.value" />

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

    <CostCard :property="p" />
    <PlacesDistance :property="p" />
    <VisitsCard :property="p" />
    <ContactsCard :property="p" />
    <div v-if="zone" class="card"><ZoneNotes :zone="zone" /></div>

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
    <Sheet v-if="dupOpen" title="¿Es la misma casa?" @close="dupOpen = false">
      <p class="muted">Se parecen por referencia, enlace, dirección y planta, o por estar a menos de 30 m con metros y precio parecidos. Si es la misma, fusiónala: esta ficha se queda y absorbe a la otra.</p>
      <ul class="list">
        <li v-for="d in duplicates" :key="d.id">
          <div class="grow">
            <div style="font-weight: 600">{{ d.title }}</div>
            <div class="tiny">{{ [d.price != null ? formatEur(d.price) : null, d.m2 != null ? formatM2(d.m2) : null, d.address ?? d.neighborhood].filter(Boolean).join(' · ') }} · {{ SOURCE_LABELS[d.source] }}</div>
          </div>
          <router-link :to="{ name: 'property', params: { id: d.id } }" class="btn ghost small" @click="dupOpen = false">Ver</router-link>
          <button type="button" class="small" @click="merge(d)"><UiIcon name="merge" :size="16" /> Fusionar</button>
        </li>
      </ul>
    </Sheet>
    <div v-if="viewing" class="photo-view" @click="viewing = null"><img :src="data.photoUrl(viewing)" alt="" /></div>
  </div>
</template>

<style>
.prop .back-link { align-self: flex-start; padding-left: 0; }
.prop-map { height: 180px; z-index: 0; }
.dup-banner { width: 100%; justify-content: flex-start; text-align: left; background: var(--warn-soft); color: var(--warn); border-color: transparent; border-radius: var(--r-md); padding: 0.6rem 0.9rem; font-size: 0.88rem; }
.status-btn { background: transparent; border-color: transparent; padding: 0.2rem 0.3rem; color: var(--ink-3); gap: 0.2rem; }
</style>
