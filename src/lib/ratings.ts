// Cálculo de notas: la mía, la de mi pareja, la conjunta y el desacuerdo. Puro y testeado.
import type { Aspect, Rating } from '../types'

export interface PropertyRatingSummary {
  /** Media de mis estrellas (null si no he puntuado nada). */
  mine: number | null
  partner: number | null
  /** Media de las dos notas (si solo hay una, esa). */
  joint: number | null
  /** Mayor diferencia de estrellas en un aspecto puntuado por los dos (null si no hay aspectos comunes). */
  disagreement: number | null
  /** Aspectos en los que os separan 2 estrellas o más. */
  disagreedAspects: string[]
  ratedByMe: boolean
  ratedByPartner: boolean
  /** Cuántos aspectos he puntuado de los activos. */
  myCount: number
}

function avg(xs: number[]): number | null {
  if (!xs.length) return null
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10
}

export function summarise(ratings: Rating[], aspects: Aspect[], myId: string, partnerId: string | null): PropertyRatingSummary {
  const active = new Set(aspects.filter((a) => a.active).map((a) => a.id))
  const mine = ratings.filter((r) => r.user_id === myId && active.has(r.aspect_id))
  const theirs = partnerId ? ratings.filter((r) => r.user_id === partnerId && active.has(r.aspect_id)) : []
  const mineAvg = avg(mine.map((r) => r.stars))
  const theirAvg = avg(theirs.map((r) => r.stars))
  const both = [mineAvg, theirAvg].filter((x): x is number => x != null)
  const joint = both.length ? Math.round((both.reduce((a, b) => a + b, 0) / both.length) * 10) / 10 : null

  const byAspect = new Map(theirs.map((r) => [r.aspect_id, r.stars]))
  let disagreement: number | null = null
  const disagreedAspects: string[] = []
  for (const r of mine) {
    const other = byAspect.get(r.aspect_id)
    if (other == null) continue
    const d = Math.abs(r.stars - other)
    disagreement = disagreement == null ? d : Math.max(disagreement, d)
    if (d >= 2) disagreedAspects.push(aspects.find((a) => a.id === r.aspect_id)?.name ?? '')
  }
  return {
    mine: mineAvg,
    partner: theirAvg,
    joint,
    disagreement,
    disagreedAspects,
    ratedByMe: mine.length > 0,
    ratedByPartner: theirs.length > 0,
    myCount: mine.length,
  }
}

/** Resúmenes de todas las casas de una vez, por id. */
export function summariseAll(ratings: Rating[], aspects: Aspect[], myId: string, partnerId: string | null): Record<string, PropertyRatingSummary> {
  const byProperty = new Map<string, Rating[]>()
  for (const r of ratings) {
    const arr = byProperty.get(r.property_id) ?? []
    arr.push(r)
    byProperty.set(r.property_id, arr)
  }
  const out: Record<string, PropertyRatingSummary> = {}
  for (const [pid, rs] of byProperty) out[pid] = summarise(rs, aspects, myId, partnerId)
  return out
}

/** "4,3" con coma, o "—". */
export function formatScore(n: number | null | undefined): string {
  return n == null ? '—' : n.toFixed(1).replace('.', ',')
}
