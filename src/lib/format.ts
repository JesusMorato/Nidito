// Formato de cifras y fechas en español. Funciones puras, con tests en format.spec.ts.

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const int = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })

/** 385000 → "385.000 €" */
export function formatEur(n: number): string {
  return eur.format(n)
}

/** 385000 → "385k" (para los pines del mapa, donde no cabe la cifra entera). */
export function formatEurShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1).replace('.', ',')}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(Math.round(n))
}

/** 92 → "92 m²" */
export function formatM2(n: number): string {
  return `${int.format(n)} m²`
}

/** Precio por metro cuadrado, redondeado: (385000, 92) → 4185. null si faltan datos. */
export function pricePerM2(price: number | null | undefined, m2: number | null | undefined): number | null {
  if (!price || !m2 || m2 <= 0) return null
  return Math.round(price / m2)
}

/** "2026-10-17" → "17 oct 2026" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')
}

/** Fecha de hoy en formato ISO (AAAA-MM-DD), en hora local. */
export function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
