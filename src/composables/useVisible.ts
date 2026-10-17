// Las casas que se ven ahora mismo (tras filtros y orden), compartidas por mapa y lista.
import { computed } from 'vue'
import { useData } from './useData'
import { useFilters } from './useFilters'
import { applyFilters, neighborhoods, sortProperties, type PropertyScores } from '../lib/filters'

/** Las fases 2 y "después" rellenan esto con notas y minutos al metro. */
let scoresProvider: () => Record<string, PropertyScores> = () => ({})
export function provideScores(fn: () => Record<string, PropertyScores>) {
  scoresProvider = fn
}

export function useVisible() {
  const data = useData()
  const { state: fs } = useFilters()
  const scores = computed(() => scoresProvider())
  const visible = computed(() => sortProperties(applyFilters(data.properties.value, fs.filters, scores.value), fs.sort, fs.dir, scores.value))
  const allNeighborhoods = computed(() => neighborhoods(data.properties.value))
  return { visible, scores, allNeighborhoods }
}
