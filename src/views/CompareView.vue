<script setup lang="ts">
// Comparar dos o tres casas lado a lado: datos, coste y estrellas por aspecto.
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSession } from '../composables/useSession'
import { useData } from '../composables/useData'
import { formatEur, formatM2, pricePerM2 } from '../lib/format'
import { formatScore, summarise } from '../lib/ratings'
import { costBreakdown, withDefaults, type FinanceSettings } from '../lib/cost'
import { EXTRA_KEYS, statusLabel, type Property } from '../types'
import UiIcon from '../components/UiIcon.vue'

const route = useRoute()
const router = useRouter()
const { state: session, partner } = useSession()
const data = useData()
onMounted(() => data.ensureLoaded(session.household?.id, session.user?.id))

const ids = computed(() => String(route.query.ids ?? '').split(',').filter(Boolean).slice(0, 3))
const items = computed(() => ids.value.map((id) => data.byId.value[id]).filter((p): p is Property => !!p))
const myId = computed(() => session.user?.id ?? '')
const sums = computed(() => Object.fromEntries(items.value.map((p) => [p.id, summarise(data.ratingsOf(p.id), data.activeAspects.value, myId.value, partner.value?.user_id ?? null)])))
const finance = computed(() => withDefaults(session.household?.finance as Partial<FinanceSettings> | undefined))
const costs = computed(() => Object.fromEntries(items.value.map((p) => [p.id, p.price != null ? costBreakdown(p.price, finance.value, { communityFee: p.community_fee, ibi: p.ibi }) : null])))
const myStars = (p: Property, aspectId: string) => data.ratingsOf(p.id).find((r) => r.user_id === myId.value && r.aspect_id === aspectId)?.stars
const theirStars = (p: Property, aspectId: string) => data.ratingsOf(p.id).find((r) => r.user_id === partner.value?.user_id && r.aspect_id === aspectId)?.stars

const rows = computed(() => [
  { label: 'Precio', get: (p: Property) => (p.price != null ? formatEur(p.price) : '—') },
  { label: 'Metros', get: (p: Property) => (p.m2 != null ? formatM2(p.m2) : '—') },
  { label: '€/m²', get: (p: Property) => { const v = pricePerM2(p.price, p.m2); return v ? v.toLocaleString('es-ES') : '—' } },
  { label: 'Habitaciones', get: (p: Property) => String(p.rooms ?? '—') },
  { label: 'Baños', get: (p: Property) => String(p.baths ?? '—') },
  { label: 'Planta', get: (p: Property) => p.floor ?? '—' },
  { label: 'Exterior', get: (p: Property) => (p.exterior == null ? '—' : p.exterior ? 'sí' : 'no') },
  { label: 'Extras', get: (p: Property) => EXTRA_KEYS.filter((x) => p.extras?.[x.key]).map((x) => x.label).join(', ') || '—' },
  { label: 'Barrio / zona', get: (p: Property) => [p.neighborhood, p.in_zone].filter(Boolean).join(' · ') || '—' },
  { label: 'Estado', get: (p: Property) => statusLabel(p.status) },
  { label: 'Encaje', get: (p: Property) => (p.fit_score != null ? String(p.fit_score) : '—') },
  { label: 'Comunidad', get: (p: Property) => (p.community_fee != null ? `${formatEur(p.community_fee)}/mes` : '—') },
  { label: 'Coste total', get: (p: Property) => (costs.value[p.id] ? formatEur(costs.value[p.id]!.total) : '—') },
  { label: 'Al mes', get: (p: Property) => (costs.value[p.id] ? formatEur(costs.value[p.id]!.monthlyTotal) : '—') },
  { label: 'Mi nota', get: (p: Property) => formatScore(sums.value[p.id]?.mine) },
  { label: partner.value ? partner.value.display_name : 'Pareja', get: (p: Property) => formatScore(sums.value[p.id]?.partner) },
  { label: 'Nota conjunta', get: (p: Property) => formatScore(sums.value[p.id]?.joint) },
])
</script>

<template>
  <div class="space-yo stack">
    <button type="button" class="ghost small" style="align-self: flex-start; padding-left: 0" @click="router.back()"><UiIcon name="chevronLeft" :size="18" /> Volver</button>
    <h1>Comparar</h1>
    <div v-if="items.length < 2" class="card"><p class="muted">Elige dos o tres casas en la Lista (botón "Comparar") para verlas lado a lado.</p></div>
    <div v-else class="card compare-wrap">
      <table class="compare">
        <thead>
          <tr>
            <th></th>
            <th v-for="p in items" :key="p.id"><router-link :to="{ name: 'property', params: { id: p.id } }">{{ p.title }}</router-link></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.label">
            <th>{{ r.label }}</th>
            <td v-for="p in items" :key="p.id">{{ r.get(p) }}</td>
          </tr>
          <tr v-for="a in data.activeAspects.value" :key="a.id">
            <th class="tiny">{{ a.name }}</th>
            <td v-for="p in items" :key="p.id">
              <span class="yo">{{ myStars(p, a.id) ?? '·' }}</span>
              <span v-if="partner" class="pareja"> / {{ theirStars(p, a.id) ?? '·' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="tiny" style="margin: 0.6rem 0 0">En los aspectos: tus estrellas / las de {{ partner?.display_name ?? 'tu pareja' }}.</p>
    </div>
  </div>
</template>

<style>
.compare-wrap { overflow-x: auto; padding: 0.6rem; }
.compare { border-collapse: collapse; width: 100%; font-size: 0.88rem; }
.compare th, .compare td { padding: 0.4rem 0.5rem; text-align: left; border-top: 1px solid var(--line); vertical-align: top; }
.compare thead th { border-top: 0; font-family: var(--font-display); font-size: 0.95rem; }
.compare thead a { color: var(--ink); text-decoration: none; }
.compare tbody th { font-weight: 600; color: var(--ink-2); white-space: nowrap; }
.compare .yo { color: var(--casa); font-weight: 700; }
.compare .pareja { color: var(--pareja); font-weight: 700; }
</style>
