// Buscador de direcciones con CartoCiudad (geocodificador público del IGN, gratuito).
// Se usa JSONP porque es lo que el servicio ofrece para llamadas desde el navegador.
import type { LatLng } from './geo'

const BASE = 'https://www.cartociudad.es/geocoder/api/geocoder'

export interface AddressCandidate {
  id: string
  type: string
  address: string
  muni: string
  province: string
  /** Solo lo rellena find(): el punto exacto. */
  point?: LatLng
}

interface RawCandidate {
  id: string
  type: string
  address: string
  muni: string
  province: string
  lat?: number
  lng?: number
  portalNumber?: number | string
  postalCode?: string
}

let seq = 0
/** Llamada JSONP: inserta un <script> y espera a que el servicio llame al callback. */
function jsonp<T>(url: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const cb = `__nidito_cc_${Date.now()}_${seq++}`
    const script = document.createElement('script')
    const w = window as unknown as Record<string, unknown>
    const cleanup = () => {
      delete w[cb]
      script.remove()
      clearTimeout(timer)
    }
    const timer = setTimeout(() => { cleanup(); reject(new Error('El buscador de direcciones no responde')) }, timeoutMs)
    w[cb] = (data: T) => { cleanup(); resolve(data) }
    script.onerror = () => { cleanup(); reject(new Error('No se ha podido consultar el buscador de direcciones')) }
    script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${cb}`
    document.head.appendChild(script)
  })
}

function clean(c: RawCandidate): AddressCandidate {
  const number = c.portalNumber && Number(c.portalNumber) > 0 ? ` ${c.portalNumber}` : ''
  return {
    id: String(c.id),
    type: c.type,
    address: `${c.address}${number}`.trim(),
    muni: c.muni,
    province: c.province,
    point: typeof c.lat === 'number' && typeof c.lng === 'number' ? { lat: c.lat, lng: c.lng } : undefined,
  }
}

/** Sugerencias mientras se escribe. Por defecto, solo Madrid. */
export async function searchAddress(q: string, limit = 6): Promise<AddressCandidate[]> {
  const query = q.trim()
  if (query.length < 3) return []
  const url = `${BASE}/candidatesJsonp?q=${encodeURIComponent(query)}&limit=${limit}&no_process=municipio,poblacion,toponimo`
  const rows = await jsonp<RawCandidate[]>(url)
  return (rows ?? []).map(clean)
}

/** Coordenadas exactas de una sugerencia elegida. */
export async function locateCandidate(c: AddressCandidate): Promise<AddressCandidate> {
  const url = `${BASE}/findJsonp?id=${encodeURIComponent(c.id)}&type=${encodeURIComponent(c.type)}&q=${encodeURIComponent(c.address)}`
  const row = await jsonp<RawCandidate>(url)
  const out = clean(row ?? (c as unknown as RawCandidate))
  return { ...c, ...out, point: out.point ?? c.point }
}

/** Dirección más cercana a un punto (al soltar el pin). Si falla, null. */
export async function reverseGeocode(p: LatLng): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/reverseGeocode?lon=${p.lng}&lat=${p.lat}`)
    if (!res.ok) return null
    const c = (await res.json()) as RawCandidate
    if (!c?.address) return null
    return `${clean(c).address}, ${c.muni ?? ''}`.replace(/,\s*$/, '')
  } catch {
    return null
  }
}

/** Etiqueta corta para enseñar en la lista de sugerencias. */
export function candidateLabel(c: AddressCandidate): string {
  return [c.address, c.muni && c.muni !== c.address ? c.muni : null].filter(Boolean).join(', ')
}
