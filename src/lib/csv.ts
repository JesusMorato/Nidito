// Exportar las casas a CSV (para tener vuestros datos fuera de la app). Puro y testeado.
import type { Property } from '../types'
import { statusLabel, SOURCE_LABELS } from '../types'
import { pricePerM2 } from './format'
import type { PropertyRatingSummary } from './ratings'

function cell(v: unknown): string {
  if (v == null) return ''
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const CSV_HEADERS = [
  'Título', 'Estado', 'Precio', 'm²', 'm² útiles', '€/m²', 'Habitaciones', 'Baños', 'Planta', 'Tipo', 'Exterior',
  'Dirección', 'Barrio', 'Zona', 'Lat', 'Lng', 'Ascensor', 'Terraza', 'Garaje', 'Trastero', 'Comunidad €/mes', 'IBI €/año',
  'Mi nota', 'Nota pareja', 'Nota conjunta', 'Desacuerdo', 'Encaje', 'Origen', 'Enlace', 'Inmobiliaria', 'Contacto', 'Referencia', 'Fecha alta', 'Notas',
]

const yn = (v: boolean | null | undefined) => (v == null ? '' : v ? 'sí' : 'no')

export function toCsv(items: Property[], scores: Record<string, PropertyRatingSummary> = {}): string {
  const rows = items.map((p) => {
    const s = scores[p.id]
    return [
      p.title, statusLabel(p.status), p.price, p.m2, p.m2_useful, pricePerM2(p.price, p.m2), p.rooms, p.baths, p.floor, p.type, yn(p.exterior),
      p.address, p.neighborhood, p.in_zone, p.lat, p.lng, yn(p.extras?.ascensor), yn(p.extras?.terraza), yn(p.extras?.garaje), yn(p.extras?.trastero),
      p.community_fee, p.ibi, s?.mine ?? null, s?.partner ?? null, s?.joint ?? null, s?.disagreement ?? null, p.fit_score,
      SOURCE_LABELS[p.source], p.url, p.agency, p.contact, p.external_ref, p.created_at.slice(0, 10), p.notes,
    ].map(cell).join(';')
  })
  // BOM para que Excel abra el CSV con acentos y punto y coma como separador (España).
  return '﻿' + [CSV_HEADERS.join(';'), ...rows].join('\n')
}

/** Descarga o comparte el archivo según lo que permita el aparato. */
export async function shareOrDownload(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const file = new File([blob], filename, { type: 'text/csv' })
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename })
      return
    } catch {
      // Cancelado o no permitido: se descarga.
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
