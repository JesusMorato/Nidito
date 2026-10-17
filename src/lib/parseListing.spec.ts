import { describe, expect, it } from 'vitest'
import { parseListing } from './parseListing'

const IDEALISTA = `Piso en venta en calle de Alonso Cano, Fuencarral, Madrid
385.000 €
92 m² · 3 hab. · 2 baños · Planta 4ª exterior con ascensor
Comunidad: 80 €/mes. IBI: 420 €/año.
Terraza de 8 m², plaza de garaje y trastero. Calefacción individual, aire acondicionado.
Orientación sur. Certificado energético: E
Ref. ABC-123 · https://www.idealista.com/inmueble/104567890/
Llama al 612 345 678`

describe('parseListing', () => {
  it('saca precio, metros, habitaciones y baños de un anuncio de portal', () => {
    const p = parseListing(IDEALISTA)
    expect(p.price).toBe(385000)
    expect(p.m2).toBe(92)
    expect(p.rooms).toBe(3)
    expect(p.baths).toBe(2)
    expect(p.floor).toBe('4')
    expect(p.exterior).toBe(true)
    expect(p.type).toBe('piso')
  })

  it('distingue comunidad e IBI del precio', () => {
    const p = parseListing(IDEALISTA)
    expect(p.community_fee).toBe(80)
    expect(p.ibi).toBe(420)
  })

  it('reconoce los extras', () => {
    const p = parseListing(IDEALISTA)
    expect(p.extras).toMatchObject({ ascensor: true, terraza: true, garaje: true, trastero: true, calefaccion: true, aire: true, orientacion: 'sur', certificado: 'E' })
  })

  it('saca enlace, referencia de Idealista, dirección, barrio y teléfono', () => {
    const p = parseListing(IDEALISTA)
    expect(p.url).toBe('https://www.idealista.com/inmueble/104567890/')
    expect(p.external_ref).toBe('idealista:104567890')
    expect(p.address).toBe('calle de Alonso Cano')
    expect(p.neighborhood).toBe('Fuencarral')
    expect(p.contact).toBe('612345678')
    expect(p.source).toBe('pegado')
    expect(p.raw_text).toContain('Piso en venta')
  })

  it('usa la primera línea como título si es razonable', () => {
    expect(parseListing(IDEALISTA).title).toBe('Piso en venta en calle de Alonso Cano, Fuencarral, Madrid')
  })

  it('inventa un título cuando el texto no tiene una línea que sirva', () => {
    const p = parseListing('https://www.fotocasa.es/x\n240000 euros, 2 dormitorios, 65 m2, barrio de Tetuán, ático sin ascensor')
    expect(p.title).toBe('Ático de 2 hab, 65 m² en Tetuán')
    expect(p.type).toBe('atico')
    expect(p.extras?.ascensor).toBe(false)
    expect(p.price).toBe(240000)
  })

  it('entiende un WhatsApp informal', () => {
    const p = parseListing('Hola Jesús! Te paso el piso de la calle Islas Cíes 12: 3 habs, 1 baño, 85m2, 310.000€, planta baja, interior. Sin garaje.')
    expect(p.price).toBe(310000)
    expect(p.m2).toBe(85)
    expect(p.rooms).toBe(3)
    expect(p.baths).toBe(1)
    expect(p.floor).toBe('bajo')
    expect(p.exterior).toBe(false)
    expect(p.extras?.garaje).toBe(false)
    expect(p.address).toBe('calle Islas Cíes 12')
  })

  it('separa metros útiles de construidos', () => {
    const p = parseListing('Piso de 100 m² construidos, 88 m² útiles. 450.000 €')
    expect(p.m2).toBe(100)
    expect(p.m2_useful).toBe(88)
  })

  it('no se inventa nada cuando el texto no tiene datos', () => {
    const p = parseListing('Nos vemos el martes a las 18:00 en el portal')
    expect(p.price).toBeUndefined()
    expect(p.m2).toBeUndefined()
    expect(p.rooms).toBeUndefined()
    expect(p.title).toBe('Nos vemos el martes a las 18:00 en el portal')
  })

  it('acepta precios con k y millones', () => {
    expect(parseListing('Precio 1.250.000 €').price).toBe(1250000)
    expect(parseListing('sale por 399k €').price).toBe(399000)
  })
})

// La función de Supabase lleva una copia del lector (Deno no importa fuera de su carpeta).
// Si alguien cambia uno y no el otro, este test lo dice.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
describe('copia del lector en supabase/functions/ingest-email', () => {
  it('es idéntica a src/lib/parseListing.ts (salvo la cabecera y la ruta de tipos)', () => {
    const src = readFileSync(resolve(__dirname, 'parseListing.ts'), 'utf8')
    const copy = readFileSync(resolve(__dirname, '../../supabase/functions/ingest-email/parseListing.ts'), 'utf8')
      .split('\n').slice(3).join('\n')
      .replace("from './types.ts'", "from '../types'")
    expect(copy).toBe(src)
  })
})
