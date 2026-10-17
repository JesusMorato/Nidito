import { describe, expect, it } from 'vitest'
import type { Property } from '../types'
import { DEFAULT_FILTERS, activeFilterCount, applyFilters, neighborhoods, sortProperties } from './filters'

function casa(over: Partial<Property>): Property {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    household_id: 'h', created_by: 'u', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
    title: 'Casa', address: null, neighborhood: null, lat: null, lng: null,
    price: null, m2: null, m2_useful: null, rooms: null, baths: null, floor: null, type: 'piso', exterior: null,
    extras: {}, community_fee: null, ibi: null, notes: null, source: 'manual', url: null, agency: null, contact: null,
    external_ref: null, raw_text: null, cadastral_ref: null, status: 'nueva', merged_into: null,
    ...over,
  }
}

const A = casa({ id: 'a', title: 'Piso Fuencarral', neighborhood: 'Fuencarral', price: 385000, m2: 92, rooms: 3, extras: { ascensor: true }, created_at: '2026-10-03T00:00:00Z' })
const B = casa({ id: 'b', title: 'Ático Tetuán', neighborhood: 'Tetuán', price: 240000, m2: 65, rooms: 2, created_at: '2026-10-02T00:00:00Z', source: 'pegado' })
const C = casa({ id: 'c', title: 'Descartada', price: 500000, m2: 120, rooms: 4, status: 'descartada', created_at: '2026-10-01T00:00:00Z' })
const D = casa({ id: 'd', title: 'Sin precio', created_at: '2026-09-30T00:00:00Z' })

describe('applyFilters', () => {
  it('por defecto esconde descartadas y retiradas', () => {
    expect(applyFilters([A, B, C, D], DEFAULT_FILTERS).map((p) => p.id)).toEqual(['a', 'b', 'd'])
    expect(applyFilters([A, B, C, D], { ...DEFAULT_FILTERS, showOut: true })).toHaveLength(4)
  })
  it('filtra por estado, precio, metros, habitaciones, barrio, extras, origen y texto', () => {
    const all = [A, B, C, D]
    expect(applyFilters(all, { ...DEFAULT_FILTERS, statuses: ['descartada'] }).map((p) => p.id)).toEqual(['c'])
    expect(applyFilters(all, { ...DEFAULT_FILTERS, priceMax: 300000 }).map((p) => p.id)).toEqual(['b'])
    expect(applyFilters(all, { ...DEFAULT_FILTERS, m2Min: 90 }).map((p) => p.id)).toEqual(['a'])
    expect(applyFilters(all, { ...DEFAULT_FILTERS, roomsMin: 3 }).map((p) => p.id)).toEqual(['a'])
    expect(applyFilters(all, { ...DEFAULT_FILTERS, neighborhood: 'tetuan' }).map((p) => p.id)).toEqual(['b'])
    expect(applyFilters(all, { ...DEFAULT_FILTERS, extras: ['ascensor'] }).map((p) => p.id)).toEqual(['a'])
    expect(applyFilters(all, { ...DEFAULT_FILTERS, sources: ['pegado'] }).map((p) => p.id)).toEqual(['b'])
    expect(applyFilters(all, { ...DEFAULT_FILTERS, text: 'ático' }).map((p) => p.id)).toEqual(['b'])
  })
  it('"sin valorar por mí" usa las notas', () => {
    const r = applyFilters([A, B], { ...DEFAULT_FILTERS, unratedByMe: true }, { a: { ratedByMe: true } })
    expect(r.map((p) => p.id)).toEqual(['b'])
  })
  it('esconde las casas fusionadas en otra', () => {
    expect(applyFilters([casa({ merged_into: 'x' })], DEFAULT_FILTERS)).toHaveLength(0)
  })
})

describe('sortProperties', () => {
  it('ordena por precio y manda las que no tienen al final', () => {
    expect(sortProperties([A, B, D], 'precio', 'asc').map((p) => p.id)).toEqual(['b', 'a', 'd'])
    expect(sortProperties([A, B, D], 'precio', 'desc').map((p) => p.id)).toEqual(['a', 'b', 'd'])
  })
  it('ordena por €/m² y por fecha', () => {
    expect(sortProperties([A, B], 'precio_m2', 'asc').map((p) => p.id)).toEqual(['b', 'a'])
    expect(sortProperties([A, B, D], 'fecha', 'desc').map((p) => p.id)).toEqual(['a', 'b', 'd'])
  })
  it('ordena por nota conjunta y desacuerdo con las puntuaciones', () => {
    const scores = { a: { joint: 3.2, disagreement: 2 }, b: { joint: 4.5, disagreement: 0 } }
    expect(sortProperties([A, B, D], 'nota', 'desc', scores).map((p) => p.id)).toEqual(['b', 'a', 'd'])
    expect(sortProperties([A, B], 'desacuerdo', 'desc', scores).map((p) => p.id)).toEqual(['a', 'b'])
  })
})

describe('neighborhoods y activeFilterCount', () => {
  it('lista barrios sin repetir y cuenta filtros', () => {
    expect(neighborhoods([A, B, casa({ neighborhood: 'tetuán' })])).toEqual(['Fuencarral', 'Tetuán'])
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0)
    expect(activeFilterCount({ ...DEFAULT_FILTERS, priceMax: 1, extras: ['terraza'] })).toBe(2)
  })
})
