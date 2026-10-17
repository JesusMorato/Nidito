import { describe, expect, it } from 'vitest'
import { formatEur, formatEurShort, formatM2, pricePerM2, formatDate } from './format'

describe('formatEur', () => {
  it('pone separador de miles y el símbolo del euro', () => {
    expect(formatEur(385000).replace(/ /g, ' ')).toBe('385.000 €')
    expect(formatEur(0).replace(/ /g, ' ')).toBe('0 €')
  })
})

describe('formatEurShort', () => {
  it('abrevia miles y millones para los pines del mapa', () => {
    expect(formatEurShort(385000)).toBe('385k')
    expect(formatEurShort(1_000_000)).toBe('1M')
    expect(formatEurShort(1_250_000)).toBe('1,3M')
    expect(formatEurShort(950)).toBe('950')
  })
})

describe('formatM2', () => {
  it('añade la unidad', () => {
    expect(formatM2(92).replace(/ /g, ' ')).toBe('92 m²')
  })
})

describe('pricePerM2', () => {
  it('redondea el precio por metro', () => {
    expect(pricePerM2(385000, 92)).toBe(4185)
  })
  it('devuelve null si faltan datos', () => {
    expect(pricePerM2(385000, 0)).toBeNull()
    expect(pricePerM2(null, 92)).toBeNull()
    expect(pricePerM2(385000, undefined)).toBeNull()
  })
})

describe('formatDate', () => {
  it('escribe la fecha corta en español', () => {
    expect(formatDate('2026-10-17')).toBe('17 oct 2026')
  })
})
