import { describe, expect, it } from 'vitest'
import type { Property } from '../types'
import { CSV_HEADERS, toCsv } from './csv'

const casa: Property = {
  id: 'a', household_id: 'h', created_by: 'u', created_at: '2026-10-10T10:00:00Z', updated_at: '',
  title: 'Piso "bonito"; Fuencarral', address: 'Calle Mayor 1', neighborhood: 'Fuencarral', lat: 40.5, lng: -3.69,
  price: 385000, m2: 92, m2_useful: null, rooms: 3, baths: 2, floor: '4', type: 'piso', exterior: true,
  extras: { ascensor: true, terraza: false }, community_fee: 80.5, ibi: null, notes: 'Línea 1\nLínea 2', source: 'pegado',
  url: null, agency: null, contact: null, external_ref: null, raw_text: null, cadastral_ref: null, status: 'interesa', merged_into: null,
  fit_score: 72, fit_notes: null, in_zone: 'Norte', inbox: 'aceptada', discard_reason: null,
}

describe('toCsv', () => {
  it('escribe cabecera y una fila por casa, con punto y coma y BOM', () => {
    const csv = toCsv([casa], { a: { mine: 4, partner: 3, joint: 3.5, disagreement: 1, disagreedAspects: [], ratedByMe: true, ratedByPartner: true, myCount: 2 } })
    const lines = csv.split('\n')
    expect(lines[0]).toBe('﻿' + CSV_HEADERS.join(';'))
    expect(lines).toHaveLength(3) // la nota tiene un salto de línea dentro de comillas
    expect(lines[1]).toContain('"Piso ""bonito""; Fuencarral";Interesa;385000;92;;4185;3;2;4;piso;sí')
    expect(lines[1]).toContain(';sí;no;;;80,5;;4;3;3,5;1;72;Texto pegado;')
  })
  it('sin notas deja las columnas vacías', () => {
    const csv = toCsv([casa])
    expect(csv.split('\n')[1]).toContain(';80,5;;;;;;72;')
  })
})
