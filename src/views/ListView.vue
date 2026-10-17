<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useSession } from '../composables/useSession'
import { useData } from '../composables/useData'
import { useFilters } from '../composables/useFilters'
import { useVisible } from '../composables/useVisible'
import { SORT_OPTIONS, activeFilterCount } from '../lib/filters'
import type { Property } from '../types'
import { formatScore } from '../lib/ratings'
import PropertyCard from '../components/PropertyCard.vue'
import FilterSheet from '../components/FilterSheet.vue'
import EmptyState from '../components/EmptyState.vue'
import UiIcon from '../components/UiIcon.vue'

const { state: session } = useSession()
const data = useData()
const { state: fs } = useFilters()
const { visible, scores, allNeighborhoods } = useVisible()

onMounted(() => data.ensureLoaded(session.household?.id))

const hasRatings = computed(() => Object.values(scores.value).some((s) => s.joint != null))
const filterCount = computed(() => activeFilterCount(fs.filters))
const sortLabel = computed(() => SORT_OPTIONS.find((o) => o.value === fs.sort)?.label ?? '')
const firstPhoto = (p: Property) => data.photosOf(p.id)[0] ?? null
const total = computed(() => data.properties.value.filter((p) => !p.merged_into).length)
</script>

<template>
  <div class="space-yo stack">
    <div class="row between">
      <h1>Casas <span class="muted" style="font-family: var(--font-body); font-weight: 500">{{ visible.length }}<template v-if="visible.length !== total"> de {{ total }}</template></span></h1>
      <button type="button" class="secondary small" @click="fs.open = true">
        <UiIcon name="list" :size="16" /> {{ sortLabel }}<span v-if="filterCount"> · {{ filterCount }} {{ filterCount === 1 ? 'filtro' : 'filtros' }}</span>
      </button>
    </div>

    <div class="search-box">
      <UiIcon name="search" :size="18" />
      <input v-model="fs.filters.text" type="search" placeholder="Buscar por título, calle, barrio…" />
    </div>

    <div v-if="data.offline.value" class="offline-bar" style="border-radius: var(--r-md)">Enseñando la última copia guardada; reconectando…</div>

    <template v-if="visible.length">
      <router-link v-for="p in visible" :key="p.id" :to="{ name: 'property', params: { id: p.id } }" class="pcard-link">
        <PropertyCard :property="p" :photo="firstPhoto(p)" :photo-url="firstPhoto(p) ? data.photoUrl(firstPhoto(p)!) : ''" :prices="data.pricesOf(p.id)">
          <template #tags>
            <span v-if="scores[p.id]?.joint != null" class="tag">★ {{ formatScore(scores[p.id].joint) }}</span>
            <span v-if="(scores[p.id]?.disagreement ?? 0) >= 2" class="tag warn">Desacuerdo</span>
          </template>
        </PropertyCard>
      </router-link>
    </template>
    <div v-else class="card">
      <EmptyState kind="casas">
        <template v-if="!total"><strong>Aún no hay casas.</strong><br />Pulsa ➕ para añadir la primera.</template>
        <template v-else><strong>Ninguna casa cumple los filtros.</strong><br /><button type="button" class="ghost small" @click="fs.filters = { ...fs.filters, text: '' }; fs.open = true">Cambiar filtros</button></template>
      </EmptyState>
    </div>

    <FilterSheet v-if="fs.open" :neighborhoods="allNeighborhoods" :has-ratings="hasRatings" @close="fs.open = false" />
  </div>
</template>

<style>
.search-box { display: flex; align-items: center; gap: 0.5rem; background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 0 0.9rem; color: var(--ink-3); }
.search-box input { border: 0; background: transparent; padding: 0.55rem 0; }
.search-box input:focus { outline: none; }
</style>
