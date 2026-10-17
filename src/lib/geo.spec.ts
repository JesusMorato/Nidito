import { describe, expect, it } from 'vitest'
import { bounds, distanceM, formatDistance, pointInPolygon, walkingMinutes } from './geo'

describe('distanceM', () => {
  it('Sol → Fuencarral (centro) son unos 9 km', () => {
    const d = distanceM({ lat: 40.4168, lng: -3.7038 }, { lat: 40.4966, lng: -3.6915 })
    expect(d).toBeGreaterThan(8500)
    expect(d).toBeLessThan(9500)
  })
  it('el mismo punto está a 0', () => {
    expect(distanceM({ lat: 40, lng: -3 }, { lat: 40, lng: -3 })).toBe(0)
  })
})

describe('formatDistance y walkingMinutes', () => {
  it('formatea metros y kilómetros', () => {
    expect(formatDistance(650)).toBe('650 m')
    expect(formatDistance(1234)).toBe('1,2 km')
    expect(formatDistance(12_345)).toBe('12 km')
  })
  it('estima minutos andando', () => {
    expect(walkingMinutes(750)).toBe(10)
    expect(walkingMinutes(30)).toBe(1)
  })
})

describe('pointInPolygon', () => {
  // Cuadrado aproximado alrededor de Fuencarral
  const square: Array<[number, number]> = [[40.48, -3.72], [40.48, -3.66], [40.52, -3.66], [40.52, -3.72]]
  it('dentro y fuera', () => {
    expect(pointInPolygon({ lat: 40.50, lng: -3.69 }, square)).toBe(true)
    expect(pointInPolygon({ lat: 40.42, lng: -3.70 }, square)).toBe(false)
    expect(pointInPolygon({ lat: 40.50, lng: -3.60 }, square)).toBe(false)
  })
  it('un polígono vacío no contiene nada', () => {
    expect(pointInPolygon({ lat: 40.5, lng: -3.69 }, [])).toBe(false)
  })
})

describe('bounds', () => {
  it('calcula la caja', () => {
    expect(bounds([{ lat: 1, lng: 2 }, { lat: 3, lng: -1 }])).toEqual({ south: 1, west: -1, north: 3, east: 2 })
    expect(bounds([])).toBeNull()
  })
})
