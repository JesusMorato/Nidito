// Las casas que se ven ahora mismo (tras filtros y orden), compartidas por mapa y lista.
import { computed } from 'vue'
import { useData } from './useData'
import { useFilters } from './useFilters'
import { useSession } from './useSession'
import { applyFilters, neighborhoods, sortProperties, type PropertyScores } from '../lib/filters'
import { summariseAll } from '../lib/ratings'

export function useVisible() {
  const data = useData()
  const { state: fs } = useFilters()
  const { state: session, partner } = useSession()
  /** Lo que las valoraciones (y, más adelante, el metro) saben de cada casa. */
  const scores = computed<Record<string, PropertyScores>>(() => {
    const myId = session.user?.id ?? ''
    const sums = summariseAll(data.ratings.value, data.aspects.value, myId, partner.value?.user_id ?? null)
    const out: Record<string, PropertyScores> = {}
    for (const [pid, s] of Object.entries(sums)) out[pid] = { joint: s.joint, mine: s.mine, disagreement: s.disagreement, ratedByMe: s.ratedByMe }
    for (const r of data.state.reactions) {
      if (r.veto) out[r.property_id] = { ...(out[r.property_id] ?? {}), vetoed: true }
    }
    return out
  })
  const visible = computed(() => sortProperties(applyFilters(data.properties.value, fs.filters, scores.value), fs.sort, fs.dir, scores.value))
  const allNeighborhoods = computed(() => neighborhoods(data.properties.value))
  return { visible, scores, allNeighborhoods }
}
