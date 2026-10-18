import { describe, expect, it } from 'vitest'
import { extractProperties, htmlToText, sanitise, splitPortalAlert } from './index'

const ALERTA = `Hola Jesús, hay 2 casas nuevas que encajan con tu búsqueda.

Piso en venta en calle de Alonso Cano, Fuencarral
385.000 € · 92 m² · 3 hab. · exterior con ascensor
https://www.idealista.com/inmueble/104567890/

Ático en venta en Tetuán
240.000 € · 65 m² · 2 hab.
https://www.idealista.com/inmueble/104567891/

Cambia tu alerta aquí: https://www.idealista.com/alertas`

describe('htmlToText', () => {
  it('convierte el HTML del correo en texto con los enlaces', () => {
    const t = htmlToText('<p>Piso <b>bonito</b></p><a href="https://www.idealista.com/inmueble/1/">ver</a><br>385.000&nbsp;&euro;')
    expect(t).toContain('Piso bonito')
    expect(t).toContain('https://www.idealista.com/inmueble/1/')
    expect(t).toContain('385.000 €')
  })
})

describe('splitPortalAlert', () => {
  it('parte una alerta de Idealista en un trozo por anuncio', () => {
    const chunks = splitPortalAlert(ALERTA)
    expect(chunks).toHaveLength(2)
    expect(chunks[0].url).toBe('https://www.idealista.com/inmueble/104567890/')
    expect(chunks[0].chunk).toContain('385.000')
    expect(chunks[1].chunk).toContain('240.000')
    expect(chunks[1].chunk).not.toContain('385.000')
  })
})

describe('extractProperties', () => {
  it('saca las dos casas de una alerta con sus referencias', async () => {
    const { properties, how } = await extractProperties('alertas@idealista.com', 'Nuevas casas', ALERTA)
    expect(how).toBe('alerta de portal')
    expect(properties).toHaveLength(2)
    expect(properties[0]).toMatchObject({ price: 385000, m2: 92, rooms: 3, external_ref: 'idealista:104567890' })
    expect(properties[1]).toMatchObject({ price: 240000, m2: 65, type: 'atico' })
  })
  it('un correo de inmobiliaria sin modelo pasa por las reglas', async () => {
    const { properties, how } = await extractProperties('inmo@norte.es', 'Piso en Fuencarral', 'Te paso un piso de 90 m2 por 350.000 € en calle Islas Cíes, 3 habitaciones.')
    expect(how).toBe('reglas')
    expect(properties).toHaveLength(1)
    expect(properties[0].price).toBe(350000)
  })
  it('un correo sin datos de casa se ignora', async () => {
    const { properties } = await extractProperties('inmo@norte.es', 'Cita', 'Nos vemos el martes a las 18:00.')
    expect(properties).toHaveLength(0)
  })
})

describe('sanitise (lo que devuelve el modelo es entrada no confiable)', () => {
  it('deja solo campos conocidos y bien tipados', () => {
    const p = sanitise({
      id: 'colado', status: 'descartada', inbox: 'aceptada', source: 'manual',
      title: '  Piso bonito  ', price: '385.000', m2: 92.4, rooms: '3', baths: 2, type: 'casa',
      exterior: 'sí', extras: { ascensor: true, terraza: null, garaje: 'no', orientacion: 'SUR', certificado: 'e', inventado: true },
      url: 'javascript:alert(1)', agency: 'Norte', lat: 40.5, lng: 200,
    }) as Record<string, unknown>
    expect(p.title).toBe('Piso bonito')
    expect(p.price).toBe(385000)
    expect(p.m2).toBe(92)
    expect(p.rooms).toBe(3)
    expect(p.type).toBeUndefined()
    expect(p.exterior).toBeNull()
    expect(p.extras).toEqual({ ascensor: true, orientacion: 'sur', certificado: 'E' })
    expect(p.url).toBeNull()
    expect(p.lat).toBe(40.5)
    expect(p.lng).toBeNull()
    expect('id' in p).toBe(false)
    expect('status' in p).toBe(false)
    expect('inbox' in p).toBe(false)
    expect('source' in p).toBe(false)
  })
  it('sin título no hay ficha; los enlaces http(s) sí pasan', () => {
    expect(sanitise({ price: 1 })).toBeNull()
    expect(sanitise('texto')).toBeNull()
    expect(sanitise({ title: 'X', url: 'https://www.idealista.com/inmueble/1/' })?.url).toBe('https://www.idealista.com/inmueble/1/')
  })
})
