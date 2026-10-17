// Tipos que reflejan las tablas de Supabase (ver docs/MODELO-DATOS.md).

export interface Household {
  blind_rating?: boolean
  /** Datos para el coste real (ver lib/cost.ts). */
  finance?: Record<string, unknown>
  id: string
  name: string
  invite_code: string
  created_at: string
}

export interface Member {
  household_id: string
  user_id: string
  display_name: string
  joined_at: string
}

export type PropertyType = 'piso' | 'atico' | 'bajo' | 'duplex' | 'estudio' | 'chalet' | 'otro'
export const PROPERTY_TYPES: Array<{ value: PropertyType; label: string }> = [
  { value: 'piso', label: 'Piso' },
  { value: 'atico', label: 'Ático' },
  { value: 'bajo', label: 'Bajo' },
  { value: 'duplex', label: 'Dúplex' },
  { value: 'estudio', label: 'Estudio' },
  { value: 'chalet', label: 'Chalet' },
  { value: 'otro', label: 'Otro' },
]

export type PropertyStatus = 'nueva' | 'interesa' | 'visita_pedida' | 'visitada' | 'oferta' | 'comprada' | 'descartada' | 'retirada'
/** Estados en el orden del embudo; los dos últimos son "fuera" y se pueden poner en cualquier momento. */
export const STATUSES: Array<{ value: PropertyStatus; label: string; out?: boolean }> = [
  { value: 'nueva', label: 'Nueva' },
  { value: 'interesa', label: 'Interesa' },
  { value: 'visita_pedida', label: 'Visita pedida' },
  { value: 'visitada', label: 'Visitada' },
  { value: 'oferta', label: 'Oferta' },
  { value: 'comprada', label: 'Comprada' },
  { value: 'descartada', label: 'Descartada', out: true },
  { value: 'retirada', label: 'Retirada', out: true },
]
export function statusLabel(s: PropertyStatus): string {
  return STATUSES.find((x) => x.value === s)?.label ?? s
}

export type PropertySource = 'manual' | 'pegado' | 'enlace' | 'correo' | 'idealista'
export const SOURCE_LABELS: Record<PropertySource, string> = {
  manual: 'A mano',
  pegado: 'Texto pegado',
  enlace: 'Enlace compartido',
  correo: 'Correo',
  idealista: 'Idealista',
}

export interface Extras {
  ascensor?: boolean
  terraza?: boolean
  garaje?: boolean
  trastero?: boolean
  piscina?: boolean
  calefaccion?: boolean
  aire?: boolean
  orientacion?: string
  certificado?: string
}
export const EXTRA_KEYS: Array<{ key: keyof Extras; label: string }> = [
  { key: 'ascensor', label: 'Ascensor' },
  { key: 'terraza', label: 'Terraza' },
  { key: 'garaje', label: 'Garaje' },
  { key: 'trastero', label: 'Trastero' },
  { key: 'piscina', label: 'Piscina' },
  { key: 'calefaccion', label: 'Calefacción' },
  { key: 'aire', label: 'Aire acondicionado' },
]

export interface Property {
  id: string
  household_id: string
  created_by: string
  created_at: string
  updated_at: string
  title: string
  address: string | null
  neighborhood: string | null
  lat: number | null
  lng: number | null
  price: number | null
  m2: number | null
  m2_useful: number | null
  rooms: number | null
  baths: number | null
  floor: string | null
  type: PropertyType
  exterior: boolean | null
  extras: Extras
  community_fee: number | null
  ibi: number | null
  notes: string | null
  source: PropertySource
  url: string | null
  agency: string | null
  contact: string | null
  external_ref: string | null
  raw_text: string | null
  cadastral_ref: string | null
  status: PropertyStatus
  merged_into: string | null
  /** Encaje con los criterios del hogar (fase 3); null si no hay criterios. */
  fit_score: number | null
  fit_notes: FitNotes | null
  in_zone: string | null
  /** Lo automático pasa por la bandeja; lo vuestro entra directo. */
  inbox: 'bandeja' | 'aceptada' | 'descartada'
  discard_reason: string | null
}

export interface FitNotes {
  fail: string[]
  ok: string[]
  missing: string[]
}

/** Lo que se manda a save_property: la ficha sin los campos que pone el servidor. */
export type PropertyInput = Partial<Omit<Property, 'household_id' | 'created_by' | 'created_at' | 'updated_at' | 'merged_into' | 'fit_score' | 'fit_notes' | 'in_zone' | 'inbox' | 'discard_reason'>> & { title: string }

export interface PriceEntry {
  id: string
  property_id: string
  price: number
  seen_at: string
  source: string
}

export interface Photo {
  id: string
  household_id: string
  property_id: string
  path: string
  created_by: string
  created_at: string
}

// ---------- fase 2: valoraciones ----------

export interface Aspect {
  id: string
  household_id: string
  name: string
  sort_order: number
  active: boolean
  created_at: string
}

export interface Rating {
  property_id: string
  user_id: string
  aspect_id: string
  stars: number
  comment: string | null
  updated_at: string
}

export interface Reaction {
  property_id: string
  user_id: string
  veto: boolean
  veto_reason: string | null
  comment: string | null
  updated_at: string
}

export interface Comment {
  id: string
  property_id: string
  user_id: string
  body: string
  created_at: string
}

export interface PushSubscriptionRow {
  id?: string
  user_id: string
  household_id: string
  endpoint: string
  p256dh: string
  auth: string
  aparato: string
}

// ---------- fase 3: criterios, zonas y enlaces ----------

export interface Criteria {
  household_id: string
  max_price: number | null
  min_m2: number | null
  min_rooms: number | null
  min_baths: number | null
  types: PropertyType[]
  /** Imprescindibles: { ascensor: true, exterior: true } */
  must: Record<string, boolean>
  /** Preferencias con puntos 1–3: { terraza: 2 } */
  prefs: Record<string, number>
  require_zone: boolean
  updated_at?: string
}

export interface Zone {
  id: string
  household_id: string
  name: string
  color: string
  /** [[lat, lng], …] */
  polygon: Array<[number, number]>
  created_at: string
}

export interface IngestToken {
  user_id: string
  household_id: string
  token: string
  created_at: string
}

// ---------- fase 4: correo ----------

export interface InboundMessage {
  id: string
  household_id: string
  user_id: string
  message_id: string
  from_addr: string
  subject: string
  received_at: string
  status: 'done' | 'ignored' | 'error'
  detail: string | null
  property_ids: string[]
  created_at: string
}

// ---------- después: lugares, visitas, contactos, notas de barrio ----------

export interface Place {
  id: string
  household_id: string
  name: string
  lat: number
  lng: number
  created_at: string
}

export interface Visit {
  id: string
  household_id: string
  property_id: string
  created_by: string
  scheduled_at: string | null
  done: boolean
  /** true = revisado y bien, false = problema, ausente = sin mirar */
  checklist: Record<string, boolean>
  notes: string | null
  created_at: string
}

export const VISIT_CHECKLIST: Array<{ key: string; label: string }> = [
  { key: 'humedades', label: 'Humedades y manchas en techos y paredes' },
  { key: 'presion_agua', label: 'Presión del agua (abrir grifos)' },
  { key: 'ruido', label: 'Ruido con las ventanas cerradas' },
  { key: 'orientacion', label: 'Orientación real y luz a esa hora' },
  { key: 'ventanas', label: 'Ventanas y cierres' },
  { key: 'instalaciones', label: 'Electricidad, caldera, aire' },
  { key: 'fachada', label: 'Fachada y portal' },
  { key: 'derramas', label: 'Derramas e ITE (preguntar)' },
  { key: 'comunidad', label: 'Cuota de comunidad confirmada' },
  { key: 'cobertura', label: 'Cobertura del móvil' },
]

export interface ContactEntry {
  id: string
  household_id: string
  property_id: string
  user_id: string
  happened_at: string
  kind: 'llamada' | 'mensaje' | 'correo' | 'visita' | 'otro'
  note: string | null
  next_step: string | null
  created_at: string
}
export const CONTACT_KINDS: Array<{ value: ContactEntry['kind']; label: string }> = [
  { value: 'llamada', label: 'Llamada' },
  { value: 'mensaje', label: 'WhatsApp' },
  { value: 'correo', label: 'Correo' },
  { value: 'visita', label: 'Visita' },
  { value: 'otro', label: 'Otro' },
]

export interface ZoneNote {
  id: string
  zone_id: string
  user_id: string
  body: string
  created_at: string
}
