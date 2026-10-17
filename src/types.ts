// Tipos que reflejan las tablas de Supabase (ver docs/MODELO-DATOS.md).

export interface Household {
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
}

/** Lo que se manda a save_property: la ficha sin los campos que pone el servidor. */
export type PropertyInput = Partial<Omit<Property, 'household_id' | 'created_by' | 'created_at' | 'updated_at' | 'merged_into'>> & { title: string }

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
