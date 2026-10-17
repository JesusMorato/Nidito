// Geometría sencilla sobre coordenadas (lat, lng). Puro y testeado.

export interface LatLng {
  lat: number
  lng: number
}

/** Centro de Madrid: donde se abre el mapa cuando no hay casas. */
export const MADRID: LatLng = { lat: 40.4168, lng: -3.7038 }

const R = 6_371_000 // radio de la Tierra en metros

/** Distancia en metros entre dos puntos (fórmula de haversine). */
export function distanceM(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/** "1,2 km" | "650 m" */
export function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1).replace('.', ',')} km`
  return `${Math.round(m)} m`
}

/** Minutos andando a unos 4,5 km/h (ritmo tranquilo). */
export function walkingMinutes(m: number): number {
  return Math.max(1, Math.round(m / 75))
}

/**
 * ¿Está el punto dentro del polígono? Ray casting clásico. El polígono es una lista
 * de vértices [lat, lng]; no hace falta repetir el primero al final.
 */
export function pointInPolygon(p: LatLng, polygon: Array<[number, number]>): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i]
    const [yj, xj] = polygon[j]
    const cross = yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi
    if (cross) inside = !inside
  }
  return inside
}

/** Caja que contiene todos los puntos, o null si no hay ninguno. */
export function bounds(points: LatLng[]): { south: number; west: number; north: number; east: number } | null {
  if (!points.length) return null
  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity
  for (const p of points) {
    south = Math.min(south, p.lat); north = Math.max(north, p.lat)
    west = Math.min(west, p.lng); east = Math.max(east, p.lng)
  }
  return { south, west, north, east }
}
