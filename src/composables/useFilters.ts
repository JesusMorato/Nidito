// Orden y filtros compartidos por mapa y lista. Se recuerdan por persona en localStorage.
import { reactive, watch } from 'vue'
import { DEFAULT_FILTERS, type Filters, type SortDir, type SortKey } from '../lib/filters'

interface FilterState {
  filters: Filters
  sort: SortKey
  dir: SortDir
  /** Hoja de filtros abierta. */
  open: boolean
}

const state = reactive<FilterState>({ filters: { ...DEFAULT_FILTERS }, sort: 'fecha', dir: 'desc', open: false })
let boundTo: string | null = null

function key(userId: string) {
  return `nidito:filtros:${userId}`
}

export function useFilters() {
  /** Carga lo guardado para este usuario (una vez por sesión). */
  function bind(userId: string) {
    if (boundTo === userId) return
    boundTo = userId
    try {
      const raw = localStorage.getItem(key(userId))
      if (raw) {
        const saved = JSON.parse(raw) as Partial<FilterState>
        state.filters = { ...DEFAULT_FILTERS, ...(saved.filters ?? {}) }
        if (saved.sort) state.sort = saved.sort
        if (saved.dir) state.dir = saved.dir
      }
    } catch {
      // Sin guardado: valores por defecto.
    }
    watch(
      () => [state.filters, state.sort, state.dir],
      () => {
        try {
          localStorage.setItem(key(userId), JSON.stringify({ filters: state.filters, sort: state.sort, dir: state.dir }))
        } catch {
          // Modo privado o sin espacio: no pasa nada.
        }
      },
      { deep: true },
    )
  }

  function reset() {
    state.filters = { ...DEFAULT_FILTERS }
  }

  function setSort(sort: SortKey, dir: SortDir) {
    state.sort = sort
    state.dir = dir
  }

  return { state, bind, reset, setSort }
}
