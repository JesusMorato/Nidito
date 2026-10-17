// Coste real de comprar una casa: precio + impuestos + gastos, entrada, hipoteca y
// coste mensual frente al alquiler. Puro y testeado.
//
// Los tipos de impuestos son los de la Comunidad de Madrid tal y como los recogió el
// plan (ITP 6 % en vivienda usada; obra nueva IVA 10 % + AJD 0,75 %; bonificaciones para
// menores de 35 y familia numerosa). HAY QUE VERIFICARLOS en la web de la Comunidad de
// Madrid antes de fiarse de la cifra: la fuente consultada tenía incoherencias. Por eso
// todos son editables en Ajustes y la ficha lo avisa.

export interface FinanceSettings {
  /** ITP (%), vivienda usada. Madrid: 6. */
  itp_rate: number
  /** Bonificación del 10 % de la cuota del ITP para menores de 35 en vivienda habitual de hasta 250.000 €. */
  under35: boolean
  /** Familia numerosa: tipo reducido del 4 % en vivienda habitual. */
  big_family: boolean
  /** Obra nueva: IVA (%) en vez de ITP. */
  vat_rate: number
  /** Actos jurídicos documentados (%), solo obra nueva. */
  ajd_rate: number
  notary: number
  registry: number
  agency: number
  appraisal: number
  /** Entrada (% del precio). */
  down_pct: number
  /** Tipo de interés anual (%). */
  rate: number
  years: number
  /** Lo que pagáis ahora de alquiler al mes. */
  rent: number | null
}

export const DEFAULT_FINANCE: FinanceSettings = {
  itp_rate: 6,
  under35: false,
  big_family: false,
  vat_rate: 10,
  ajd_rate: 0.75,
  notary: 1200,
  registry: 600,
  agency: 400,
  appraisal: 400,
  down_pct: 20,
  rate: 3,
  years: 30,
  rent: null,
}

export function withDefaults(f: Partial<FinanceSettings> | null | undefined): FinanceSettings {
  return { ...DEFAULT_FINANCE, ...(f ?? {}) }
}

export interface CostBreakdown {
  price: number
  /** ITP (usada) o IVA + AJD (obra nueva). */
  taxes: number
  taxLabel: string
  fees: number
  total: number
  /** Entrada + impuestos + gastos: lo que hay que tener ahorrado. */
  cashNeeded: number
  mortgage: number
  monthlyMortgage: number
  /** Cuota + comunidad + IBI/12. */
  monthlyTotal: number
  /** Diferencia con el alquiler actual (positivo = más caro que el alquiler). */
  vsRent: number | null
}

/** Cuota mensual de un préstamo francés. */
export function monthlyPayment(principal: number, annualRatePct: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0
  const r = annualRatePct / 100 / 12
  const n = years * 12
  if (r === 0) return principal / n
  return (principal * r) / (1 - Math.pow(1 + r, -n))
}

export function taxes(price: number, f: FinanceSettings, isNew: boolean): { amount: number; label: string } {
  if (isNew) {
    const vat = price * (f.vat_rate / 100)
    const ajd = price * (f.ajd_rate / 100)
    return { amount: vat + ajd, label: `IVA ${f.vat_rate} % + AJD ${f.ajd_rate} %` }
  }
  if (f.big_family) return { amount: price * 0.04, label: 'ITP 4 % (familia numerosa)' }
  let amount = price * (f.itp_rate / 100)
  let label = `ITP ${f.itp_rate} %`
  if (f.under35 && price <= 250_000) {
    amount *= 0.9
    label += ' con bonificación del 10 % (menores de 35)'
  }
  return { amount, label }
}

export function costBreakdown(
  price: number,
  f: FinanceSettings,
  opts: { isNew?: boolean; communityFee?: number | null; ibi?: number | null } = {},
): CostBreakdown {
  const t = taxes(price, f, !!opts.isNew)
  const fees = f.notary + f.registry + f.agency + f.appraisal
  const total = price + t.amount + fees
  const down = price * (f.down_pct / 100)
  const mortgage = Math.max(0, price - down)
  const monthlyMortgage = monthlyPayment(mortgage, f.rate, f.years)
  const monthlyTotal = monthlyMortgage + (opts.communityFee ?? 0) + (opts.ibi ?? 0) / 12
  return {
    price,
    taxes: Math.round(t.amount),
    taxLabel: t.label,
    fees,
    total: Math.round(total),
    cashNeeded: Math.round(down + t.amount + fees),
    mortgage: Math.round(mortgage),
    monthlyMortgage: Math.round(monthlyMortgage),
    monthlyTotal: Math.round(monthlyTotal),
    vsRent: f.rent != null && f.rent > 0 ? Math.round(monthlyTotal - f.rent) : null,
  }
}
