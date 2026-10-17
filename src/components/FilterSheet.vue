<script setup lang="ts">
// Orden y filtros, compartidos por mapa y lista.
import { computed } from 'vue'
import { useFilters } from '../composables/useFilters'
import { SORT_OPTIONS, type SortKey } from '../lib/filters'
import { EXTRA_KEYS, SOURCE_LABELS, STATUSES, type Extras, type PropertySource, type PropertyStatus } from '../types'
import Sheet from './Sheet.vue'

defineProps<{ neighborhoods: string[]; hasRatings?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const { state, reset, setSort } = useFilters()
const f = computed(() => state.filters)

function onSort(ev: Event) {
  const key = (ev.target as HTMLSelectElement).value as SortKey
  setSort(key, SORT_OPTIONS.find((o) => o.value === key)?.defaultDir ?? 'desc')
}
function toggleDir() {
  setSort(state.sort, state.dir === 'asc' ? 'desc' : 'asc')
}
function toggle<T>(arr: T[], v: T) {
  const i = arr.indexOf(v)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(v)
}
const num = (ev: Event) => {
  const v = (ev.target as HTMLInputElement).value.trim()
  return v === '' ? null : Number(v)
}
const sources = Object.keys(SOURCE_LABELS) as PropertySource[]
</script>

<template>
  <Sheet title="Ordenar y filtrar" @close="emit('close')">
    <div class="space-yo">
      <div class="field">
        <label for="fs-sort">Ordenar por</label>
        <div class="row">
          <select id="fs-sort" :value="state.sort" class="grow" @change="onSort">
            <option v-for="o in SORT_OPTIONS" :key="o.value" :value="o.value" :disabled="!hasRatings && ['nota', 'mi_nota', 'desacuerdo'].includes(o.value)">{{ o.label }}</option>
          </select>
          <button type="button" class="secondary small" @click="toggleDir">{{ state.dir === 'asc' ? 'Ascendente' : 'Descendente' }}</button>
        </div>
      </div>

      <div class="field">
        <label>Estado</label>
        <div class="chips">
          <button v-for="s in STATUSES" :key="s.value" type="button" class="chip" :class="{ active: f.statuses.includes(s.value) }" @click="toggle(f.statuses as PropertyStatus[], s.value)">{{ s.label }}</button>
        </div>
        <label class="check" style="margin-top: 0.5rem"><input v-model="f.showOut" type="checkbox" /> Enseñar también descartadas y retiradas</label>
      </div>

      <div class="grid2">
        <div class="field">
          <label for="fs-pmin">Precio mínimo</label>
          <input id="fs-pmin" :value="f.priceMin ?? ''" inputmode="numeric" placeholder="€" @change="f.priceMin = num($event)" />
        </div>
        <div class="field">
          <label for="fs-pmax">Precio máximo</label>
          <input id="fs-pmax" :value="f.priceMax ?? ''" inputmode="numeric" placeholder="€" @change="f.priceMax = num($event)" />
        </div>
      </div>
      <div class="grid2">
        <div class="field">
          <label for="fs-m2">m² mínimos</label>
          <input id="fs-m2" :value="f.m2Min ?? ''" inputmode="numeric" @change="f.m2Min = num($event)" />
        </div>
        <div class="field">
          <label for="fs-rooms">Habitaciones mínimas</label>
          <input id="fs-rooms" :value="f.roomsMin ?? ''" inputmode="numeric" @change="f.roomsMin = num($event)" />
        </div>
      </div>

      <div v-if="neighborhoods.length" class="field">
        <label for="fs-nb">Barrio</label>
        <select id="fs-nb" v-model="f.neighborhood">
          <option :value="null">Todos</option>
          <option v-for="n in neighborhoods" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>

      <div class="field">
        <label>Tiene que tener</label>
        <div class="chips">
          <button v-for="x in EXTRA_KEYS" :key="x.key" type="button" class="chip" :class="{ active: f.extras.includes(x.key) }" @click="toggle(f.extras as Array<keyof Extras>, x.key)">{{ x.label }}</button>
        </div>
      </div>

      <div class="field">
        <label>Cómo llegó</label>
        <div class="chips">
          <button v-for="s in sources" :key="s" type="button" class="chip" :class="{ active: f.sources.includes(s) }" @click="toggle(f.sources as PropertySource[], s)">{{ SOURCE_LABELS[s] }}</button>
        </div>
      </div>

      <label v-if="hasRatings" class="check field"><input v-model="f.unratedByMe" type="checkbox" /> Solo las que yo aún no he valorado</label>

      <div class="row" style="justify-content: space-between; margin-top: 0.5rem">
        <button type="button" class="ghost" @click="reset()">Quitar filtros</button>
        <button type="button" @click="emit('close')">Listo</button>
      </div>
    </div>
  </Sheet>
</template>
