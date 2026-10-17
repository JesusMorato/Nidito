import { describe, expect, it } from 'vitest'
import { DEFAULT_FINANCE, costBreakdown, monthlyPayment, taxes, withDefaults } from './cost'

describe('monthlyPayment', () => {
  it('calcula la cuota de un préstamo francés', () => {
    // 300.000 € al 3 % a 30 años ≈ 1.264,81 €/mes
    expect(monthlyPayment(300000, 3, 30)).toBeCloseTo(1264.81, 1)
  })
  it('sin interés es el principal entre los meses', () => {
    expect(monthlyPayment(120000, 0, 10)).toBe(1000)
  })
  it('sin préstamo no hay cuota', () => {
    expect(monthlyPayment(0, 3, 30)).toBe(0)
  })
})

describe('taxes', () => {
  it('vivienda usada: ITP del 6 %', () => {
    expect(taxes(300000, DEFAULT_FINANCE, false)).toEqual({ amount: 18000, label: 'ITP 6 %' })
  })
  it('menores de 35 hasta 250.000 €: bonificación del 10 % de la cuota', () => {
    const t = taxes(200000, { ...DEFAULT_FINANCE, under35: true }, false)
    expect(t.amount).toBe(10800)
    expect(t.label).toContain('bonificación')
    // Por encima de 250.000 € no se aplica
    expect(taxes(300000, { ...DEFAULT_FINANCE, under35: true }, false).amount).toBe(18000)
  })
  it('familia numerosa: 4 %', () => {
    expect(taxes(300000, { ...DEFAULT_FINANCE, big_family: true }, false).amount).toBe(12000)
  })
  it('obra nueva: IVA 10 % + AJD 0,75 %', () => {
    const t = taxes(300000, DEFAULT_FINANCE, true)
    expect(t.amount).toBeCloseTo(32250, 0)
    expect(t.label).toContain('IVA')
  })
})

describe('costBreakdown', () => {
  it('suma precio, impuestos y gastos, y calcula entrada, hipoteca y cuota', () => {
    const c = costBreakdown(300000, { ...DEFAULT_FINANCE, rent: 934 }, { communityFee: 80, ibi: 420 })
    expect(c.taxes).toBe(18000)
    expect(c.fees).toBe(2600)
    expect(c.total).toBe(320600)
    expect(c.mortgage).toBe(240000)
    expect(c.cashNeeded).toBe(60000 + 18000 + 2600)
    expect(c.monthlyMortgage).toBe(1012)
    expect(c.monthlyTotal).toBe(1012 + 80 + 35)
    expect(c.vsRent).toBe(1127 - 934)
  })
  it('sin alquiler no compara', () => {
    expect(costBreakdown(300000, DEFAULT_FINANCE).vsRent).toBeNull()
  })
  it('withDefaults rellena lo que falte', () => {
    expect(withDefaults({ rent: 900 }).itp_rate).toBe(6)
    expect(withDefaults(null).years).toBe(30)
  })
})
