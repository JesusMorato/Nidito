// Orden y filtros de la lista y del mapa. Puro y testeado. Mapa y lista comparten
// el mismo estado (composables/useFilters.ts), así que lo que filtras en uno se
// ve filtrado en el otro.
import type { Extras, Property, PropertyStatus, PropertySource } from '../types'
import { pricePerM2 } from './format'

export type SortKey = 'nota' | 'mi_nota' | 'desacuerdo' | 'precio' | 'precio_m2' | 'm2' | 'fecha' | 'metro'
export type SortDir = 'asc' | 'desc'

export const SORT_OPTIONS: Array<{ value: SortKey; label: string; defaultDir: SortDir }> = [
  { value: 'fecha', label: 'Más recientes', defaultDir: 'desc' },
  { value: 'nota', label: 'Nota conjunta', defaultDir: 'desc' },
  { value: 'mi_nota', label: 'Mi nota', defaultDir: 'desc' },
  { value: 'desacuerdo', label: 'Más desacuerdo', defaultDir: 'desc' },
  { value: 'precio', label: 'Precio', defaultDir: 'asc' },
  { value: 'precio_m2', label: '€/m²', defaultDir: 'asc' },
  { value: 'm2', label: 'Metros', defaultDir: 'desc' },
  { value: 'metro', label: 'Minutos al metro', defaultDir: 'asc' },
]

export interface Filters {
  /** Estados incluidos. Vacío = todos los que no están "fuera" (descartada/retirada). */
  statuses: PropertyStatus[]
  /** Incluir también descartadas y retiradas. */
  showOut: boolean
  priceMin: number | null
  priceMax: number | null
  m2Min: number | null
  roomsMin: number | null
  neighborhood: string | null
  sources: PropertySource[]
  /** Extras que tienen que estar presentes. */
  extras: Array<keyof Extras>
  /** Solo las que yo aún no he valorado (fase 2). */
  unratedByMe: boolean
  text: string
}

export const DEFAULT_FILTERS: Filters = {
  statuses: [],
  showOut: false,
  priceMin: null,
  priceMax: null,
  m2Min: null,
  roomsMin: null,
  neighborhood: null,
  sources: [],
  extras: [],
  unratedByMe: false,
  text: '',
}

/** Lo que la fase 2 (valoraciones) y "después" (metro) saben de cada casa. */
export interface PropertyScores {
  joint?: number | null
  mine?: number | null
  disagreement?: number | null
  ratedByMe?: boolean
  /** Alguno de los dos ha puesto veto: sale de la lista principal. */
  vetoed?: boolean
  metroMinutes?: number | null
}

const OUT: PropertyStatus[] = ['descartada', 'retirada']

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function applyFilters(items: Property[], f: Filters, scores: Record<string, PropertyScores> = {}): Property[] {
  const q = norm(f.text.trim())
  return items.filter((p) => {
    if (p.merged_into) return false
    if (f.statuses.length ? !f.statuses.includes(p.status) : !f.showOut && OUT.includes(p.status)) return false
    if (!f.showOut && !f.statuses.length && scores[p.id]?.vetoed) return false
    if (f.priceMin != null && (p.price == null || p.price < f.priceMin)) return false
    if (f.priceMax != null && (p.price == null || p.price > f.priceMax)) return false
    if (f.m2Min != null && (p.m2 == null || p.m2 < f.m2Min)) return false
    if (f.roomsMin != null && (p.rooms == null || p.rooms < f.roomsMin)) return false
    if (f.neighborhood && norm(p.neighborhood ?? '') !== norm(f.neighborhood)) return false
    if (f.sources.length && !f.sources.includes(p.source)) return false
    for (const k of f.extras) if (!p.extras?.[k]) return false
    if (f.unratedByMe && scores[p.id]?.ratedByMe) return false
    if (q) {
      const hay = norm([p.title, p.address, p.neighborhood, p.agency, p.notes].filter(Boolean).join(' '))
      if (!hay.includes(q)) return false
    }
    return true
  })
}

/** Valor por el que se ordena; null va siempre al final, suba o baje. */
function sortValue(p: Property, key: SortKey, s: PropertyScores | undefined): number | null {
  switch (key) {
    case 'fecha': return Date.parse(p.created_at)
    case 'precio': return p.price
    case 'precio_m2': return pricePerM2(p.price, p.m2)
    case 'm2': return p.m2
    case 'nota': return s?.joint ?? null
    case 'mi_nota': return s?.mine ?? null
    case 'desacuerdo': return s?.disagreement ?? null
    case 'metro': return s?.metroMinutes ?? null
  }
}

export function sortProperties(items: Property[], key: SortKey, dir: SortDir, scores: Record<string, PropertyScores> = {}): Property[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    const va = sortValue(a, key, scores[a.id])
    const vb = sortValue(b, key, scores[b.id])
    if (va == null && vb == null) return Date.parse(b.created_at) - Date.parse(a.created_at)
    if (va == null) return 1
    if (vb == null) return -1
    if (va === vb) return Date.parse(b.created_at) - Date.parse(a.created_at)
    return (va - vb) * sign
  })
}

/** Barrios distintos que hay guardados, para el filtro. */
export function neighborhoods(items: Property[]): string[] {
  // Se queda con la primera forma de escribirlo (la segunda suele ser un descuido).
  const seen = new Map<string, string>()
  for (const p of items) if (p.neighborhood && !seen.has(norm(p.neighborhood))) seen.set(norm(p.neighborhood), p.neighborhood)
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'es'))
}

/** Cuántos filtros hay activos (para la bolita del botón). */
export function activeFilterCount(f: Filters): number {
  let n = 0
  if (f.statuses.length) n++
  if (f.showOut) n++
  if (f.priceMin != null || f.priceMax != null) n++
  if (f.m2Min != null) n++
  if (f.roomsMin != null) n++
  if (f.neighborhood) n++
  if (f.sources.length) n++
  if (f.extras.length) n++
  if (f.unratedByMe) n++
  return n
}
