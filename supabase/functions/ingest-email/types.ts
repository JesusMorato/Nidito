// Tipos mínimos para la copia de parseListing.ts (ver src/types.ts).
export type PropertyType = 'piso' | 'atico' | 'bajo' | 'duplex' | 'estudio' | 'chalet' | 'otro'
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
export interface PropertyInput {
  id?: string
  title: string
  address?: string | null
  neighborhood?: string | null
  lat?: number | null
  lng?: number | null
  price?: number | null
  m2?: number | null
  m2_useful?: number | null
  rooms?: number | null
  baths?: number | null
  floor?: string | null
  type?: PropertyType
  exterior?: boolean | null
  extras?: Extras
  community_fee?: number | null
  ibi?: number | null
  notes?: string | null
  source?: 'manual' | 'pegado' | 'enlace' | 'correo' | 'idealista'
  url?: string | null
  agency?: string | null
  contact?: string | null
  external_ref?: string | null
  raw_text?: string | null
  cadastral_ref?: string | null
}
