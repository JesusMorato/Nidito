<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
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

const router = useRouter()
const { state: session } = useSession()
const comparing = ref(false)
const picked = ref<string[]>([])
function togglePick(id: string) {
  const i = picked.value.indexOf(id)
  if (i >= 0) picked.value.splice(i, 1)
  else if (picked.value.length < 3) picked.value.push(id)
}
function goCompare() {
  router.push({ name: 'compare', query: { ids: picked.value.join(',') } })
  comparing.value = false
  picked.value = []
}
const data = useData()
const { state: fs } = useFilters()
const { visible, scores, allNeighborhoods } = useVisible()

onMounted(() => data.ensureLoaded(session.household?.id, session.user?.id))

const hasRatings = computed(() => Object.values(scores.value).some((s) => s.joint != null))
const filterCount = computed(() => activeFilterCount(fs.filters))
const sortLabel = computed(() => SORT_OPTIONS.find((o) => o.value === fs.sort)?.label ?? '')
const firstPhoto = (p: Property) => data.photosOf(p.id)[0] ?? null
const total = computed(() => data.properties.value.filter((p) => !p.merged_into && p.inbox === 'aceptada').length)
</script>

<template>
  <div class="space-yo stack">
    <div class="row between">
      <h1>Casas <span class="muted" style="font-family: var(--font-body); font-weight: 500">{{ visible.length }}<template v-if="visible.length !== total"> de {{ total }}</template></span></h1>
      <div class="row" style="gap: 0.3rem">
        <button type="button" class="icon" :class="{ active: comparing }" aria-label="Comparar" title="Comparar" @click="comparing = !comparing; picked = []"><UiIcon name="compare" :size="20" /></button>
        <button type="button" class="secondary small" @click="fs.open = true">
          <UiIcon name="list" :size="16" /> {{ sortLabel }}<span v-if="filterCount"> · {{ filterCount }} {{ filterCount === 1 ? 'filtro' : 'filtros' }}</span>
        </button>
      </div>
    </div>
    <div v-if="comparing" class="row between compare-bar">
      <span class="tiny grow">Marca dos o tres casas para compararlas ({{ picked.length }}/3)</span>
      <button type="button" class="small" :disabled="picked.length < 2" @click="goCompare">Comparar</button>
    </div>

    <div class="search-box">
      <UiIcon name="search" :size="18" />
      <input v-model="fs.filters.text" type="search" placeholder="Buscar por título, calle, barrio…" />
    </div>

    <div v-if="data.offline.value" class="offline-bar" style="border-radius: var(--r-md)">Enseñando la última copia guardada; reconectando…</div>

    <router-link :to="{ name: 'inbox' }" class="inbox-banner" :class="{ quiet: !data.inboxItems.value.length }">
      <UiIcon name="inbox" :size="18" />
      <span class="grow">
        <template v-if="data.inboxItems.value.length">{{ data.inboxItems.value.length }} {{ data.inboxItems.value.length === 1 ? 'casa nueva por revisar' : 'casas nuevas por revisar' }}</template>
        <template v-else>Bandeja: nada por revisar</template>
      </span>
      <UiIcon name="chevronRight" :size="16" />
    </router-link>

    <template v-if="visible.length">
      <component :is="comparing ? 'div' : 'router-link'" v-for="p in visible" :key="p.id" :to="comparing ? undefined : { name: 'property', params: { id: p.id } }" class="pcard-link" :class="{ picked: picked.includes(p.id) }" @click="comparing && togglePick(p.id)">
        <PropertyCard :property="p" :photo="firstPhoto(p)" :photo-url="firstPhoto(p) ? data.photoUrl(firstPhoto(p)!) : ''" :prices="data.pricesOf(p.id)">
          <template #tags>
            <span v-if="scores[p.id]?.joint != null" class="tag">★ {{ formatScore(scores[p.id].joint) }}</span>
            <span v-if="(scores[p.id]?.disagreement ?? 0) >= 2" class="tag warn">Desacuerdo</span>
            <span v-if="comparing" class="tag" :class="picked.includes(p.id) ? '' : 'muted'">{{ picked.includes(p.id) ? 'Elegida' : 'Elegir' }}</span>
          </template>
        </PropertyCard>
      </component>
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
.compare-bar { background: var(--surface-2); border-radius: var(--r-md); padding: 0.4rem 0.4rem 0.4rem 0.8rem; }
.pcard-link.picked .pcard { outline: 2px solid var(--casa); }
button.icon.active { background: var(--casa-soft); color: var(--casa-ink); }
.inbox-banner { display: flex; align-items: center; gap: 0.5rem; text-decoration: none; background: var(--casa-soft); color: var(--casa-ink); font-weight: 600; font-size: 0.9rem; border-radius: var(--r-md); padding: 0.55rem 0.8rem; }
.inbox-banner.quiet { background: transparent; color: var(--ink-3); font-weight: 500; border: 1px dashed var(--line); }
</style>
