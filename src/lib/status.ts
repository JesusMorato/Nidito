// Color de cada estado (variables CSS de style.css). Lo usan los pines del mapa y las etiquetas.
import type { PropertyStatus } from '../types'

export const STATUS_COLOR: Record<PropertyStatus, string> = {
  nueva: 'var(--casa)',
  interesa: 'var(--pareja)',
  visita_pedida: 'var(--warn)',
  visitada: 'var(--warn)',
  oferta: 'var(--pos)',
  comprada: 'var(--star)',
  descartada: 'var(--ink-3)',
  retirada: 'var(--ink-3)',
}

/** Color según la nota conjunta (1–5): de rojo a verde. */
export function scoreColor(score: number | null | undefined): string {
  if (score == null) return 'var(--ink-3)'
  if (score >= 4) return 'var(--pos)'
  if (score >= 3) return 'var(--warn)'
  return 'var(--neg)'
}
