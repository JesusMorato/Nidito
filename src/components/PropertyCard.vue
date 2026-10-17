<script setup lang="ts">
// Tarjeta de una casa en la lista (y en el mapa al tocar un pin).
import { computed } from 'vue'
import type { Photo, PriceEntry, Property } from '../types'
import { SOURCE_LABELS } from '../types'
import { formatEur, formatM2, pricePerM2 } from '../lib/format'
import StatusChip from './StatusChip.vue'
import UiIcon from './UiIcon.vue'

const props = defineProps<{ property: Property; photo?: Photo | null; photoUrl?: string; prices?: PriceEntry[]; compact?: boolean }>()

const ppm2 = computed(() => pricePerM2(props.property.price, props.property.m2))
const facts = computed(() =>
  [
    props.property.m2 != null ? formatM2(props.property.m2) : null,
    props.property.rooms != null ? `${props.property.rooms} hab` : null,
    props.property.baths != null ? `${props.property.baths} ${props.property.baths === 1 ? 'baño' : 'baños'}` : null,
    props.property.floor ? (/^\d+$/.test(props.property.floor) ? `${props.property.floor}ª` : props.property.floor) : null,
  ].filter(Boolean).join(' · '),
)
/** Bajada de precio: el último precio del historial es menor que el anterior. */
const drop = computed(() => {
  const h = props.prices ?? []
  if (h.length < 2) return null
  const last = h[h.length - 1].price, prev = h[h.length - 2].price
  return last < prev ? prev - last : null
})
const where = computed(() => props.property.neighborhood ?? props.property.address ?? '')
</script>

<template>
  <article class="pcard" :class="{ compact }">
    <div class="pcard-photo">
      <img v-if="photo && photoUrl" :src="photoUrl" alt="" loading="lazy" />
      <div v-else class="pcard-nophoto"><UiIcon name="home" :size="26" /></div>
    </div>
    <div class="pcard-body">
      <div class="row between" style="gap: 0.3rem; align-items: flex-start">
        <strong class="pcard-price num">{{ property.price != null ? formatEur(property.price) : 'Sin precio' }}</strong>
        <StatusChip :status="property.status" />
      </div>
      <div class="pcard-title ellipsis">{{ property.title }}</div>
      <div class="tiny ellipsis">{{ facts }}<template v-if="facts && where"> · </template>{{ where }}</div>
      <div class="row pcard-tags">
        <span v-if="ppm2" class="tag muted">{{ ppm2.toLocaleString('es-ES') }} €/m²</span>
        <span v-if="drop" class="tag pos">↓ {{ formatEur(drop) }}</span>
        <span v-if="property.source !== 'manual'" class="tag muted">{{ SOURCE_LABELS[property.source] }}</span>
        <slot name="tags" />
      </div>
    </div>
  </article>
</template>

<style>
.pcard { display: grid; grid-template-columns: 96px 1fr; gap: 0.75rem; background: var(--surface); border-radius: var(--r-lg); box-shadow: var(--shadow); overflow: hidden; min-width: 0; }
.pcard.compact { grid-template-columns: 76px 1fr; box-shadow: none; border: 1px solid var(--line); }
.pcard-photo { background: var(--surface-2); min-height: 96px; display: grid; place-items: center; color: var(--ink-3); }
.pcard-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pcard-body { padding: 0.6rem 0.8rem 0.6rem 0; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
.pcard-price { font-size: 1.15rem; font-weight: 700; }
.pcard-title { font-weight: 600; font-size: 0.95rem; }
.pcard-tags { gap: 0.3rem; margin-top: 0.2rem; }
a.pcard-link { text-decoration: none; color: inherit; display: block; }
</style>
