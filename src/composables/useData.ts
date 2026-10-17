// Todo lo que la app lee y escribe en Supabase sobre casas vive aquí.
// Las vistas y componentes reciben datos por props o leen este estado; nunca
// llaman a Supabase directamente. Las casas se guardan SIEMPRE con save_property.
import { computed, reactive, ref } from 'vue'
import { supabase } from '../supabase'
import type { Photo, PriceEntry, Property, PropertyInput, PropertyStatus } from '../types'
import { isNetworkError, loadSnapshot, saveSnapshot } from '../lib/offline'
import { resizeImage } from '../lib/resizeImage'

interface State {
  loadedFor: string | null
  loadedAt: number
  loading: boolean
  properties: Property[]
  photos: Photo[]
  prices: PriceEntry[]
}

const state = reactive<State>({ loadedFor: null, loadedAt: 0, loading: false, properties: [], photos: [], prices: [] })
/** true mientras enseñamos la copia local porque el servidor no responde. */
const offline = ref(false)
/** URLs firmadas de las fotos (el cubo es privado), por ruta. Caducan en una hora. */
const photoUrls = reactive<Record<string, string>>({})

function normalise(p: Record<string, unknown>): Property {
  return {
    ...(p as unknown as Property),
    price: p.price == null ? null : Number(p.price),
    community_fee: p.community_fee == null ? null : Number(p.community_fee),
    ibi: p.ibi == null ? null : Number(p.ibi),
    extras: (p.extras as Property['extras']) ?? {},
  }
}

async function fetchAll(hid: string) {
  const [pr, ph, pc] = await Promise.all([
    supabase.from('properties').select('*').order('created_at', { ascending: false }),
    supabase.from('photos').select('*').order('created_at', { ascending: true }),
    supabase.from('price_history').select('*').order('seen_at', { ascending: true }),
  ])
  const err = pr.error ?? ph.error ?? pc.error
  if (err) throw new Error(err.message)
  state.properties = (pr.data ?? []).map((r) => normalise(r as Record<string, unknown>))
  state.photos = (ph.data ?? []) as Photo[]
  state.prices = (pc.data ?? []).map((r) => ({ ...(r as PriceEntry), price: Number((r as PriceEntry).price) }))
  state.loadedFor = hid
  state.loadedAt = Date.now()
  offline.value = false
  saveSnapshot(`datos:${hid}`, { properties: state.properties, photos: state.photos, prices: state.prices })
}

async function load(hid: string) {
  if (state.loading) return
  state.loading = true
  try {
    await fetchAll(hid)
  } catch (e) {
    const copy = loadSnapshot<{ properties: Property[]; photos: Photo[]; prices: PriceEntry[] }>(`datos:${hid}`)
    if (isNetworkError(e) && copy) {
      state.properties = copy.value.properties
      state.photos = copy.value.photos
      state.prices = copy.value.prices
      state.loadedFor = hid
      offline.value = true
    } else {
      throw e
    }
  } finally {
    state.loading = false
  }
}

export function useData() {
  /** Carga los datos del hogar si aún no están (o son de otro hogar). */
  async function ensureLoaded(hid: string | undefined) {
    if (!hid) return
    if (state.loadedFor !== hid) await load(hid)
  }

  /** Recarga si los datos tienen más de `maxAgeMs` (por defecto, un minuto). */
  async function refreshIfStale(maxAgeMs = 60_000) {
    if (!state.loadedFor) return
    if (Date.now() - state.loadedAt > maxAgeMs) await load(state.loadedFor)
  }

  async function refresh() {
    if (state.loadedFor) await load(state.loadedFor)
  }

  const properties = computed(() => state.properties)
  const byId = computed(() => Object.fromEntries(state.properties.map((p) => [p.id, p])) as Record<string, Property>)
  const photosOf = (propertyId: string) => state.photos.filter((f) => f.property_id === propertyId)
  const pricesOf = (propertyId: string) => state.prices.filter((e) => e.property_id === propertyId)

  /** Crea o actualiza una casa. Devuelve su id. */
  async function saveProperty(input: PropertyInput): Promise<string> {
    const { data, error } = await supabase.rpc('save_property', { p: input })
    if (error) throw new Error(error.message)
    await refresh()
    return data as string
  }

  async function setStatus(id: string, status: PropertyStatus) {
    const { error } = await supabase.rpc('set_property_status', { p_id: id, p_status: status })
    if (error) throw new Error(error.message)
    const p = state.properties.find((x) => x.id === id)
    if (p) p.status = status
  }

  async function deleteProperty(id: string) {
    // Primero las fotos del almacén (la fila de la base de datos se va en cascada).
    const paths = photosOf(id).map((f) => f.path)
    if (paths.length) await supabase.storage.from('fotos').remove(paths)
    const { error } = await supabase.from('properties').delete().eq('id', id)
    if (error) throw new Error(error.message)
    state.properties = state.properties.filter((p) => p.id !== id)
    state.photos = state.photos.filter((f) => f.property_id !== id)
  }

  async function uploadPhoto(property: Property, file: File, userId: string) {
    const blob = await resizeImage(file)
    const path = `${property.household_id}/${property.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
    const up = await supabase.storage.from('fotos').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
    if (up.error) throw new Error(up.error.message)
    const { data, error } = await supabase
      .from('photos')
      .insert({ household_id: property.household_id, property_id: property.id, path, created_by: userId })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    state.photos.push(data as Photo)
  }

  async function deletePhoto(photo: Photo) {
    await supabase.storage.from('fotos').remove([photo.path])
    const { error } = await supabase.from('photos').delete().eq('id', photo.id)
    if (error) throw new Error(error.message)
    state.photos = state.photos.filter((f) => f.id !== photo.id)
  }

  /** Pide (y recuerda) la URL firmada de una foto. Devuelve '' mientras llega. */
  function photoUrl(photo: Photo): string {
    if (photoUrls[photo.path]) return photoUrls[photo.path]
    supabase.storage.from('fotos').createSignedUrl(photo.path, 3600).then(({ data }) => {
      if (data?.signedUrl) photoUrls[photo.path] = data.signedUrl
    })
    return ''
  }

  return {
    state,
    offline,
    properties,
    byId,
    photosOf,
    pricesOf,
    ensureLoaded,
    refreshIfStale,
    refresh,
    saveProperty,
    setStatus,
    deleteProperty,
    uploadPhoto,
    deletePhoto,
    photoUrl,
  }
}
