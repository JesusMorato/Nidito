// COPIA de src/lib/parseListing.ts para la función de Supabase (Deno no puede importar fuera de su carpeta).
// No editar aquí: src/lib/parseListing.spec.ts comprueba que las dos copias son idénticas.

// "Pegar texto del anuncio": saca los datos de la ficha de un texto pegado
// (la descripción de Idealista/Fotocasa, un WhatsApp de la inmobiliaria, un correo).
// Son reglas, no un modelo: funcionan sin conexión y no cuestan nada. Lo que no
// reconoce lo deja vacío para rellenarlo a mano.
import type { Extras, PropertyInput, PropertyType } from './types.ts'

/** "385.000" | "385000" | "385,5k" → 385000 */
function toNumber(s: string): number {
  const t = s.trim().toLowerCase()
  if (/k$/.test(t)) return Math.round(parseFloat(t.replace(/\./g, '').replace(',', '.')) * 1000)
  // "385.000,50" → 385000.5 ; "1.250.000" → 1250000 ; "92,5" → 92.5
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return parseFloat(t.replace(/\./g, '').replace(',', '.'))
  return parseFloat(t.replace(',', '.'))
}

const NUM = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?k?`

type Period = 'month' | 'year' | 'none'
/** Todas las cantidades en euros, clasificadas: al mes (comunidad), al año (IBI) o sueltas (precio). */
function euroAmounts(text: string): Array<{ value: number; period: Period }> {
  const out: Array<{ value: number; period: Period }> = []
  const re = new RegExp(String.raw`(${NUM})\s*(?:€|euros?|eur\b)|(?:€)\s*(${NUM})`, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const raw = m[1] ?? m[2]
    const value = toNumber(raw)
    if (!Number.isFinite(value)) continue
    const before = text.slice(Math.max(0, m.index - 18), m.index).toLowerCase()
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 12).toLowerCase()
    let period: Period = 'none'
    if (/^\s*(?:\/\s*a[ñn]o|al a[ñn]o|anual)/.test(after) || /\bibi\b/.test(before)) period = 'year'
    else if (/^\s*(?:\/\s*mes|al mes|mensual)/.test(after) || /comunidad/.test(before)) period = 'month'
    out.push({ value, period })
  }
  return out
}

function firstInt(text: string, re: RegExp): number | undefined {
  const m = text.match(re)
  if (!m) return undefined
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) ? n : undefined
}

export function parseListing(text: string): PropertyInput {
  const t = text.replace(/ /g, ' ')
  const lower = t.toLowerCase()
  const out: PropertyInput = { title: '', source: 'pegado', raw_text: text.trim() }

  // --- precio, comunidad, IBI ---
  const amounts = euroAmounts(t)
  const monthly = amounts.filter((a) => a.period === 'month')
  const yearly = amounts.filter((a) => a.period === 'year')
  const candidates = amounts.filter((a) => a.period === 'none' && a.value >= 20_000)
  if (candidates.length) out.price = Math.round(Math.max(...candidates.map((a) => a.value)))
  const fee = monthly.find((a) => a.value < 2000)
  if (fee) out.community_fee = fee.value
  const ibi = yearly.find((a) => a.value < 10_000)
  if (ibi) out.ibi = ibi.value

  // --- metros ---
  const m2All = [...t.matchAll(new RegExp(String.raw`(${NUM})\s*(?:m²|m2|metros(?:\s+cuadrados)?)\s*(útiles|construidos)?`, 'gi'))]
  for (const m of m2All) {
    const v = Math.round(toNumber(m[1]))
    if (!Number.isFinite(v) || v < 15 || v > 2000) continue
    const kind = (m[2] ?? '').toLowerCase()
    if (kind === 'útiles') out.m2_useful ??= v
    else out.m2 ??= v
  }
  if (out.m2 == null && out.m2_useful != null) {
    // Solo hay útiles: se guardan como útiles y los construidos quedan vacíos.
  }

  // --- habitaciones y baños ---
  out.rooms = firstInt(lower, /(\d{1,2})\s*(?:hab\b|habs?\b|habitaci|dormitorio|dorm\b)/) ?? firstInt(lower, /(?:habitaciones|dormitorios)\s*:?\s*(\d{1,2})/)
  out.baths = firstInt(lower, /(\d{1,2})\s*(?:baños?|aseos?|wc)/) ?? firstInt(lower, /baños?\s*:?\s*(\d{1,2})/)

  // --- planta y tipo ---
  const planta = lower.match(/planta\s+(\d{1,2}|baja|bajo|sótano)\b/) ?? lower.match(/(\d{1,2})\s*[ªº°]\s*(?:planta)?/) ?? lower.match(/\b(bajo)\b/)
  if (planta) out.floor = planta[1] === 'baja' ? 'bajo' : planta[1]
  let type: PropertyType = 'piso'
  if (/[áa]tico/.test(lower)) type = 'atico'
  else if (/d[úu]plex/.test(lower)) type = 'duplex'
  else if (/chalet|adosad|pareado|casa\b/.test(lower)) type = 'chalet'
  else if (/estudio|loft/.test(lower)) type = 'estudio'
  else if (/\bbajo\b/.test(lower) && !/planta\s+\d/.test(lower)) type = 'bajo'
  out.type = type
  if (/\bexterior\b/.test(lower)) out.exterior = true
  else if (/\binterior\b/.test(lower)) out.exterior = false

  // --- extras ---
  const extras: Extras = {}
  const has = (re: RegExp) => re.test(lower)
  const notHas = (word: string) => new RegExp(String.raw`sin\s+${word}`).test(lower)
  if (has(/ascensor/)) extras.ascensor = !notHas('ascensor')
  if (has(/terraza|balc[óo]n/)) extras.terraza = !notHas('terraza')
  if (has(/garaje|parking|plaza de aparcamiento/)) extras.garaje = !notHas('garaje') && !notHas('plaza')
  if (has(/trastero/)) extras.trastero = !notHas('trastero')
  if (has(/piscina/)) extras.piscina = !notHas('piscina')
  if (has(/calefacci[óo]n/)) extras.calefaccion = !notHas('calefacci[óo]n')
  if (has(/aire acondicionado|a\/a\b|climatizaci[óo]n/)) extras.aire = true
  const ori = lower.match(/orientaci[óo]n\s*:?\s*(norte|sur|este|oeste|noreste|noroeste|sureste|suroeste)/) ?? lower.match(/orientad[oa]\s+al\s+(norte|sur|este|oeste)/)
  if (ori) extras.orientacion = ori[1]
  const cert = lower.match(/certificado\s+energ[ée]tico\s*:?\s*([a-g])\b/) ?? lower.match(/consumo\s*:?\s*([a-g])\b/)
  if (cert) extras.certificado = cert[1].toUpperCase()
  out.extras = extras

  // --- enlace y referencia ---
  const url = t.match(/https?:\/\/[^\s)]+/)
  if (url) {
    out.url = url[0]
    const ideal = url[0].match(/idealista\.com\/(?:[a-z]{2}\/)?inmueble\/(\d+)/)
    if (ideal) {
      out.external_ref = `idealista:${ideal[1]}`
      out.source = 'pegado'
    }
  }
  const ref = lower.match(/(?:ref\.?|referencia)\s*:?\s*([a-z0-9-]{3,20})/)
  if (ref && !out.external_ref) out.external_ref = ref[1].toUpperCase()

  // --- dirección y barrio ---
  const addr = t.match(/\b((?:calle|c\/|avenida|avda\.?|av\.|paseo|pº|plaza|pza\.?|camino|traves[ií]a|ronda|carretera|glorieta)\s+(?:de\s+|del\s+|la\s+)?[A-ZÁÉÍÓÚÑa-záéíóúñ][^,\n;:()\d]{1,60}(?:,?\s*\d{1,4})?)/i)
  if (addr) out.address = addr[1].replace(/\s+/g, ' ').trim()
  const NAME = String.raw`[A-ZÁÉÍÓÚÑ][\wáéíóúñ-]+(?:\s+(?:de\s+|del\s+|el\s+|la\s+)?[A-ZÁÉÍÓÚÑ][\wáéíóúñ-]+){0,3}`
  const barrio = t.match(new RegExp(String.raw`\b(?:barrio|zona)\s+(?:de\s+)?(${NAME})`))
    ?? t.match(new RegExp(String.raw`(?:\ben|,)\s+(${NAME}),\s*Madrid\b`))
  if (barrio) out.neighborhood = barrio[1].trim()

  // --- contacto ---
  const phone = t.match(/(?:\+34\s?)?(?:[6789]\d{2}[\s.-]?\d{3}[\s.-]?\d{3})/)
  if (phone) out.contact = phone[0].replace(/[\s.-]/g, '')

  // --- título ---
  const firstLine = t.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? ''
  if (firstLine.length >= 8 && firstLine.length <= 80 && !/^https?:/.test(firstLine)) {
    out.title = firstLine.replace(/\s+/g, ' ')
  } else {
    const typeWord = { piso: 'Piso', atico: 'Ático', bajo: 'Bajo', duplex: 'Dúplex', estudio: 'Estudio', chalet: 'Chalet', otro: 'Casa' }[type]
    const where = out.neighborhood ?? out.address ?? ''
    const bits = [out.rooms != null ? `${out.rooms} hab` : null, out.m2 != null ? `${out.m2} m²` : null].filter(Boolean).join(', ')
    out.title = [typeWord, bits ? `de ${bits}` : null, where ? `en ${where}` : null].filter(Boolean).join(' ')
  }

  return out
}
