// Todo lo que la app lee y escribe en Supabase sobre casas vive aquí.
// Las vistas y componentes reciben datos por props o leen este estado; nunca
// llaman a Supabase directamente. Las casas se guardan SIEMPRE con save_property.
import { computed, reactive, ref } from 'vue'
import { supabase } from '../supabase'
import type { Aspect, Comment, ContactEntry, Criteria, InboundMessage, IngestToken, Photo, Place, Visit, ZoneNote, PriceEntry, Property, PropertyInput, PropertyStatus, PushSubscriptionRow, Rating, Reaction, Zone } from '../types'
import { isNetworkError, loadSnapshot, saveSnapshot } from '../lib/offline'
import { resizeImage } from '../lib/resizeImage'

interface State {
  /** Hogar cuyos datos están cargados (null = nada cargado). */
  loadedFor: string | null
  /** Usuario para el que se cargaron: si entra otro en el mismo navegador, se vacía todo. */
  loadedUser: string | null
  loadedAt: number
  loading: boolean
  properties: Property[]
  photos: Photo[]
  prices: PriceEntry[]
  aspects: Aspect[]
  ratings: Rating[]
  reactions: Reaction[]
  comments: Comment[]
  criteria: Criteria | null
  zones: Zone[]
  inbound: InboundMessage[]
  places: Place[]
  visits: Visit[]
  contacts: ContactEntry[]
  zoneNotes: ZoneNote[]
}

const EMPTY: State = { loadedFor: null, loadedUser: null, loadedAt: 0, loading: false, properties: [], photos: [], prices: [], aspects: [], ratings: [], reactions: [], comments: [], criteria: null, zones: [], inbound: [], places: [], visits: [], contacts: [], zoneNotes: [] }
const state = reactive<State>(structuredClone(EMPTY))

/**
 * Vacía todo lo cargado. Se llama al cerrar sesión o cuando entra otro usuario en el
 * mismo navegador: así nadie ve (ni un instante) las valoraciones a ciegas del otro.
 */
export function resetData() {
  Object.assign(state, structuredClone(EMPTY))
  for (const k of Object.keys(photoUrls)) delete photoUrls[k]
  offline.value = false
}
/** true mientras enseñamos la copia local porque el servidor no responde. */
const offline = ref(false)
/** URLs firmadas de las fotos (el cubo es privado), por ruta. Caducan en una hora. */
const photoUrls = reactive<Record<string, string>>({})

type Snapshot = Pick<State, 'properties' | 'photos' | 'prices' | 'aspects' | 'ratings' | 'reactions' | 'comments' | 'criteria' | 'zones'>

function normalise(p: Record<string, unknown>): Property {
  return {
    ...(p as unknown as Property),
    price: p.price == null ? null : Number(p.price),
    community_fee: p.community_fee == null ? null : Number(p.community_fee),
    ibi: p.ibi == null ? null : Number(p.ibi),
    extras: (p.extras as Property['extras']) ?? {},
  }
}

async function fetchAll(hid: string, uid: string) {
  const [pr, ph, pc, as, ra, re, co, cr, zo, im, pl, vi, cl, zn] = await Promise.all([
    supabase.from('properties').select('*').order('created_at', { ascending: false }),
    supabase.from('photos').select('*').order('created_at', { ascending: true }),
    supabase.from('price_history').select('*').order('seen_at', { ascending: true }),
    supabase.from('rating_aspects').select('*').order('sort_order', { ascending: true }),
    supabase.from('ratings').select('*'),
    supabase.from('property_reactions').select('*'),
    supabase.from('comments').select('*').order('created_at', { ascending: true }),
    supabase.from('criteria').select('*').maybeSingle(),
    supabase.from('zones').select('*').order('created_at', { ascending: true }),
    supabase.from('inbound_messages').select('id, household_id, user_id, message_id, from_addr, subject, received_at, status, detail, property_ids, created_at').order('received_at', { ascending: false }).limit(30),
    supabase.from('places').select('*').order('created_at', { ascending: true }),
    supabase.from('visits').select('*').order('scheduled_at', { ascending: true }),
    supabase.from('contact_log').select('*').order('happened_at', { ascending: false }),
    supabase.from('zone_notes').select('*').order('created_at', { ascending: true }),
  ])
  const err = pr.error ?? ph.error ?? pc.error ?? as.error ?? ra.error ?? re.error ?? co.error ?? cr.error ?? zo.error ?? im.error ?? pl.error ?? vi.error ?? cl.error ?? zn.error
  if (err) throw new Error(err.message)
  state.properties = (pr.data ?? []).map((r) => normalise(r as Record<string, unknown>))
  state.photos = (ph.data ?? []) as Photo[]
  state.prices = (pc.data ?? []).map((r) => ({ ...(r as PriceEntry), price: Number((r as PriceEntry).price) }))
  state.aspects = (as.data ?? []) as Aspect[]
  state.ratings = (ra.data ?? []).map((r) => ({ ...(r as Rating), stars: Number((r as Rating).stars) }))
  state.reactions = (re.data ?? []) as Reaction[]
  state.comments = (co.data ?? []) as Comment[]
  state.criteria = (cr.data as Criteria | null) ?? null
  state.zones = (zo.data ?? []) as Zone[]
  state.inbound = (im.data ?? []) as InboundMessage[]
  state.places = (pl.data ?? []) as Place[]
  state.visits = (vi.data ?? []) as Visit[]
  state.contacts = (cl.data ?? []) as ContactEntry[]
  state.zoneNotes = (zn.data ?? []) as ZoneNote[]
  state.loadedFor = hid
  state.loadedUser = uid
  state.loadedAt = Date.now()
  offline.value = false
  // La copia local es por usuario Y hogar: lo que ve uno (a ciegas) no lo carga el otro.
  const snap: Snapshot = { properties: state.properties, photos: state.photos, prices: state.prices, aspects: state.aspects, ratings: state.ratings, reactions: state.reactions, comments: state.comments, criteria: state.criteria, zones: state.zones }
  saveSnapshot(`datos:${uid}:${hid}`, snap)
}

async function load(hid: string, uid: string) {
  if (state.loading) return
  state.loading = true
  try {
    await fetchAll(hid, uid)
  } catch (e) {
    const copy = loadSnapshot<Snapshot>(`datos:${uid}:${hid}`)
    if (isNetworkError(e) && copy) {
      Object.assign(state, copy.value)
      state.loadedFor = hid
      state.loadedUser = uid
      offline.value = true
    } else {
      throw e
    }
  } finally {
    state.loading = false
  }
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export function useData() {
  /** Carga los datos del hogar si aún no están (o son de otro hogar o de otro usuario). */
  async function ensureLoaded(hid: string | undefined, uid: string | undefined) {
    if (!hid || !uid) return
    if (state.loadedFor !== hid || state.loadedUser !== uid) {
      if (state.loadedFor) resetData()
      await load(hid, uid)
    }
  }

  /** Recarga si los datos tienen más de `maxAgeMs` (por defecto, un minuto). */
  async function refreshIfStale(maxAgeMs = 60_000) {
    if (!state.loadedFor || !state.loadedUser) return
    if (Date.now() - state.loadedAt > maxAgeMs) await load(state.loadedFor, state.loadedUser)
  }

  async function refresh() {
    if (state.loadedFor && state.loadedUser) await load(state.loadedFor, state.loadedUser)
  }

  const properties = computed(() => state.properties)
  const byId = computed(() => Object.fromEntries(state.properties.map((p) => [p.id, p])) as Record<string, Property>)
  const aspects = computed(() => state.aspects)
  const activeAspects = computed(() => state.aspects.filter((a) => a.active))
  const ratings = computed(() => state.ratings)
  const photosOf = (propertyId: string) => state.photos.filter((f) => f.property_id === propertyId)
  const pricesOf = (propertyId: string) => state.prices.filter((e) => e.property_id === propertyId)
  const ratingsOf = (propertyId: string) => state.ratings.filter((r) => r.property_id === propertyId)
  const reactionsOf = (propertyId: string) => state.reactions.filter((r) => r.property_id === propertyId)
  const commentsOf = (propertyId: string) => state.comments.filter((c) => c.property_id === propertyId)

  // ---------- casas ----------
  /** Crea o actualiza una casa. Devuelve su id. */
  async function saveProperty(input: PropertyInput): Promise<string> {
    const { data, error } = await supabase.rpc('save_property', { p: input })
    fail(error)
    await refresh()
    return data as string
  }

  async function setStatus(id: string, status: PropertyStatus) {
    const { error } = await supabase.rpc('set_property_status', { p_id: id, p_status: status })
    fail(error)
    const p = state.properties.find((x) => x.id === id)
    if (p) p.status = status
  }

  async function deleteProperty(id: string) {
    // Primero las fotos del almacén (la fila de la base de datos se va en cascada).
    const paths = photosOf(id).map((f) => f.path)
    if (paths.length) await supabase.storage.from('fotos').remove(paths)
    const { error } = await supabase.from('properties').delete().eq('id', id)
    fail(error)
    state.properties = state.properties.filter((p) => p.id !== id)
    state.photos = state.photos.filter((f) => f.property_id !== id)
    state.ratings = state.ratings.filter((r) => r.property_id !== id)
    state.comments = state.comments.filter((c) => c.property_id !== id)
  }

  // ---------- fotos ----------
  async function uploadPhoto(property: Property, file: File, userId: string) {
    const blob = await resizeImage(file)
    const path = `${property.household_id}/${property.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
    const up = await supabase.storage.from('fotos').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
    fail(up.error)
    const { data, error } = await supabase
      .from('photos')
      .insert({ household_id: property.household_id, property_id: property.id, path, created_by: userId })
      .select('*')
      .single()
    fail(error)
    state.photos.push(data as Photo)
  }

  async function deletePhoto(photo: Photo) {
    await supabase.storage.from('fotos').remove([photo.path])
    const { error } = await supabase.from('photos').delete().eq('id', photo.id)
    fail(error)
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

  // ---------- valoraciones ----------
  /** Guarda mis estrellas de un aspecto. Devuelve true si es mi primera valoración de esa casa. */
  async function rate(propertyId: string, aspectId: string, userId: string, stars: number, comment: string | null): Promise<boolean> {
    const first = !state.ratings.some((r) => r.property_id === propertyId && r.user_id === userId)
    const row = { property_id: propertyId, user_id: userId, aspect_id: aspectId, stars, comment: comment?.trim() || null, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('ratings').upsert(row, { onConflict: 'property_id,user_id,aspect_id' })
    fail(error)
    const i = state.ratings.findIndex((r) => r.property_id === propertyId && r.user_id === userId && r.aspect_id === aspectId)
    if (i >= 0) state.ratings[i] = row
    else state.ratings.push(row)
    // Si es la primera, puede que ahora ya pueda ver las de mi pareja (modo a ciegas).
    if (first) await refreshRatings()
    return first
  }

  async function unrate(propertyId: string, aspectId: string, userId: string) {
    const { error } = await supabase.from('ratings').delete().match({ property_id: propertyId, user_id: userId, aspect_id: aspectId })
    fail(error)
    state.ratings = state.ratings.filter((r) => !(r.property_id === propertyId && r.user_id === userId && r.aspect_id === aspectId))
  }

  async function refreshRatings() {
    const { data, error } = await supabase.from('ratings').select('*')
    if (!error && data) state.ratings = data.map((r) => ({ ...(r as Rating), stars: Number((r as Rating).stars) }))
  }

  async function setReaction(propertyId: string, userId: string, patch: Partial<Pick<Reaction, 'veto' | 'veto_reason' | 'comment'>>) {
    const existing = state.reactions.find((r) => r.property_id === propertyId && r.user_id === userId)
    const row: Reaction = { property_id: propertyId, user_id: userId, veto: false, veto_reason: null, comment: null, ...existing, ...patch, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('property_reactions').upsert(row, { onConflict: 'property_id,user_id' })
    fail(error)
    const i = state.reactions.findIndex((r) => r.property_id === propertyId && r.user_id === userId)
    if (i >= 0) state.reactions[i] = row
    else state.reactions.push(row)
  }

  async function addComment(propertyId: string, userId: string, body: string): Promise<Comment> {
    const { data, error } = await supabase.from('comments').insert({ property_id: propertyId, user_id: userId, body: body.trim() }).select('*').single()
    fail(error)
    state.comments.push(data as Comment)
    return data as Comment
  }

  async function deleteComment(id: string) {
    const { error } = await supabase.from('comments').delete().eq('id', id)
    fail(error)
    state.comments = state.comments.filter((c) => c.id !== id)
  }

  // ---------- aspectos ----------
  async function addAspect(householdId: string, name: string) {
    const sort = Math.max(0, ...state.aspects.map((a) => a.sort_order)) + 1
    const { data, error } = await supabase.from('rating_aspects').insert({ household_id: householdId, name: name.trim(), sort_order: sort }).select('*').single()
    fail(error)
    state.aspects.push(data as Aspect)
  }
  async function updateAspect(id: string, patch: Partial<Pick<Aspect, 'name' | 'active' | 'sort_order'>>) {
    const { error } = await supabase.from('rating_aspects').update(patch).eq('id', id)
    fail(error)
    const a = state.aspects.find((x) => x.id === id)
    if (a) Object.assign(a, patch)
    state.aspects.sort((x, y) => x.sort_order - y.sort_order)
  }
  async function deleteAspect(id: string) {
    const { error } = await supabase.from('rating_aspects').delete().eq('id', id)
    fail(error)
    state.aspects = state.aspects.filter((a) => a.id !== id)
    state.ratings = state.ratings.filter((r) => r.aspect_id !== id)
  }
  async function moveAspect(id: string, dir: -1 | 1) {
    const list = [...state.aspects].sort((x, y) => x.sort_order - y.sort_order)
    const i = list.findIndex((a) => a.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    const a = list[i], b = list[j]
    await Promise.all([updateAspect(a.id, { sort_order: b.sort_order }), updateAspect(b.id, { sort_order: a.sort_order })])
  }

  async function setBlindRating(householdId: string, on: boolean) {
    const { error } = await supabase.from('households').update({ blind_rating: on }).eq('id', householdId)
    fail(error)
    await refreshRatings()
  }

  // ---------- criterios, zonas, duplicados y enlaces ----------
  const criteria = computed(() => state.criteria)
  const zones = computed(() => state.zones)

  async function saveCriteria(householdId: string, c: Omit<Criteria, 'household_id' | 'updated_at'>) {
    const row = { household_id: householdId, ...c, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('criteria').upsert(row, { onConflict: 'household_id' })
    fail(error)
    state.criteria = row
    await reapplyCriteria()
  }
  /** Vuelve a calcular el encaje de todas las casas (tras cambiar criterios o zonas). */
  async function reapplyCriteria() {
    const { error } = await supabase.rpc('reapply_criteria')
    fail(error)
    const { data } = await supabase.from('properties').select('*').order('created_at', { ascending: false })
    if (data) state.properties = data.map((r) => normalise(r as Record<string, unknown>))
  }
  async function addZone(householdId: string, name: string, polygon: Array<[number, number]>, color: string) {
    const { data, error } = await supabase.from('zones').insert({ household_id: householdId, name: name.trim(), polygon, color }).select('*').single()
    fail(error)
    state.zones.push(data as Zone)
    await reapplyCriteria()
  }
  async function deleteZone(id: string) {
    const { error } = await supabase.from('zones').delete().eq('id', id)
    fail(error)
    state.zones = state.zones.filter((z) => z.id !== id)
    await reapplyCriteria()
  }
  async function findDuplicates(propertyId: string): Promise<Property[]> {
    const { data, error } = await supabase.rpc('find_duplicates', { p_id: propertyId })
    fail(error)
    return ((data ?? []) as Record<string, unknown>[]).map(normalise)
  }
  async function mergeProperties(keepId: string, dropId: string) {
    const { error } = await supabase.rpc('merge_properties', { p_keep: keepId, p_drop: dropId })
    fail(error)
    await refresh()
  }
  async function loadIngestToken(): Promise<IngestToken | null> {
    const { data, error } = await supabase.from('ingest_tokens').select('*').maybeSingle()
    fail(error)
    return (data as IngestToken | null) ?? null
  }
  async function createIngestToken(householdId: string, userId: string): Promise<IngestToken> {
    const bytes = new Uint8Array(18)
    crypto.getRandomValues(bytes)
    const token = Array.from(bytes, (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')
    const row = { user_id: userId, household_id: householdId, token }
    const { data, error } = await supabase.from('ingest_tokens').upsert(row, { onConflict: 'user_id' }).select('*').single()
    fail(error)
    return data as IngestToken
  }
  async function deleteIngestToken(userId: string) {
    const { error } = await supabase.from('ingest_tokens').delete().eq('user_id', userId)
    fail(error)
  }

  // ---------- Bandeja (fase 4) ----------
  const inboxItems = computed(() => state.properties.filter((p) => !p.merged_into && p.inbox === 'bandeja'))
  const autoDiscarded = computed(() => state.properties.filter((p) => !p.merged_into && p.inbox === 'descartada'))
  const inbound = computed(() => state.inbound)
  async function setInbox(id: string, inbox: Property['inbox'], reason: string | null = null) {
    const { error } = await supabase.rpc('set_inbox', { p_id: id, p_inbox: inbox, p_reason: reason })
    fail(error)
    const p = state.properties.find((x) => x.id === id)
    if (p) {
      p.inbox = inbox
      p.discard_reason = inbox === 'descartada' ? (reason ?? p.discard_reason) : null
    }
  }

  // ---------- después: lugares, visitas, contactos, notas de barrio, finanzas ----------
  const places = computed(() => state.places)
  const visitsOf = (propertyId: string) => state.visits.filter((v) => v.property_id === propertyId)
  const contactsOf = (propertyId: string) => state.contacts.filter((c) => c.property_id === propertyId)
  const zoneNotesOf = (zoneId: string) => state.zoneNotes.filter((n) => n.zone_id === zoneId)

  async function addPlace(householdId: string, name: string, lat: number, lng: number) {
    const { data, error } = await supabase.from('places').insert({ household_id: householdId, name: name.trim(), lat, lng }).select('*').single()
    fail(error)
    state.places.push(data as Place)
  }
  async function deletePlace(id: string) {
    const { error } = await supabase.from('places').delete().eq('id', id)
    fail(error)
    state.places = state.places.filter((p) => p.id !== id)
  }

  async function addVisit(property: Property, userId: string, scheduledAt: string | null) {
    const { data, error } = await supabase.from('visits').insert({ household_id: property.household_id, property_id: property.id, created_by: userId, scheduled_at: scheduledAt }).select('*').single()
    fail(error)
    state.visits.push(data as Visit)
    return data as Visit
  }
  async function updateVisit(id: string, patch: Partial<Pick<Visit, 'scheduled_at' | 'done' | 'checklist' | 'notes'>>) {
    const { error } = await supabase.from('visits').update(patch).eq('id', id)
    fail(error)
    const v = state.visits.find((x) => x.id === id)
    if (v) Object.assign(v, patch)
  }
  async function deleteVisit(id: string) {
    const { error } = await supabase.from('visits').delete().eq('id', id)
    fail(error)
    state.visits = state.visits.filter((v) => v.id !== id)
  }

  async function addContact(property: Property, userId: string, entry: Pick<ContactEntry, 'kind' | 'note' | 'next_step'> & { happened_at?: string }) {
    const { data, error } = await supabase.from('contact_log').insert({ household_id: property.household_id, property_id: property.id, user_id: userId, ...entry }).select('*').single()
    fail(error)
    state.contacts.unshift(data as ContactEntry)
  }
  async function deleteContact(id: string) {
    const { error } = await supabase.from('contact_log').delete().eq('id', id)
    fail(error)
    state.contacts = state.contacts.filter((c) => c.id !== id)
  }

  async function addZoneNote(zoneId: string, userId: string, body: string) {
    const { data, error } = await supabase.from('zone_notes').insert({ zone_id: zoneId, user_id: userId, body: body.trim() }).select('*').single()
    fail(error)
    state.zoneNotes.push(data as ZoneNote)
  }
  async function deleteZoneNote(id: string) {
    const { error } = await supabase.from('zone_notes').delete().eq('id', id)
    fail(error)
    state.zoneNotes = state.zoneNotes.filter((n) => n.id !== id)
  }

  async function saveFinance(householdId: string, finance: Record<string, unknown>) {
    const { error } = await supabase.from('households').update({ finance }).eq('id', householdId)
    fail(error)
  }

  // ---------- avisos (Web Push) ----------
  async function loadPushSubscriptions(): Promise<PushSubscriptionRow[]> {
    const { data, error } = await supabase.from('push_subscriptions').select('*')
    fail(error)
    return (data ?? []) as PushSubscriptionRow[]
  }
  async function savePushSubscription(row: PushSubscriptionRow) {
    const { error } = await supabase.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' })
    fail(error)
  }
  async function removePushSubscription(endpoint: string) {
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    fail(error)
  }
  /** Avisa a la pareja. Va por detrás: si falla, no pasa nada. */
  function notifyPartner(kind: 'casa' | 'valoracion' | 'comentario' | 'precio', propertyId: string, extra: Record<string, unknown> = {}) {
    supabase.functions.invoke('notify-partner', { body: { kind, property_id: propertyId, ...extra } }).catch(() => {})
  }
  async function testPush(): Promise<unknown> {
    const { data, error } = await supabase.functions.invoke('notify-partner', { body: { prueba: true } })
    fail(error)
    return data
  }

  return {
    state,
    offline,
    properties,
    byId,
    aspects,
    activeAspects,
    ratings,
    photosOf,
    pricesOf,
    ratingsOf,
    reactionsOf,
    commentsOf,
    ensureLoaded,
    refreshIfStale,
    refresh,
    saveProperty,
    setStatus,
    deleteProperty,
    uploadPhoto,
    deletePhoto,
    photoUrl,
    rate,
    unrate,
    setReaction,
    addComment,
    deleteComment,
    addAspect,
    updateAspect,
    deleteAspect,
    moveAspect,
    setBlindRating,
    criteria,
    zones,
    saveCriteria,
    reapplyCriteria,
    addZone,
    deleteZone,
    findDuplicates,
    mergeProperties,
    loadIngestToken,
    createIngestToken,
    deleteIngestToken,
    inboxItems,
    autoDiscarded,
    inbound,
    setInbox,
    places,
    visitsOf,
    contactsOf,
    zoneNotesOf,
    addPlace,
    deletePlace,
    addVisit,
    updateVisit,
    deleteVisit,
    addContact,
    deleteContact,
    addZoneNote,
    deleteZoneNote,
    saveFinance,
    loadPushSubscriptions,
    savePushSubscription,
    removePushSubscription,
    notifyPartner,
    testPush,
  }
}
