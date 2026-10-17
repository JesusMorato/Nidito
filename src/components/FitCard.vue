<script setup lang="ts">
// Encaje de una casa con los criterios del hogar: lo que cumple, lo que incumple y lo que falta.
import { computed } from 'vue'
import type { Property } from '../types'

const props = defineProps<{ property: Property; hasCriteria: boolean }>()
const notes = computed(() => {
  const n = props.property.fit_notes
  return n ? { fail: n.fail ?? [], ok: n.ok ?? [], missing: n.missing ?? [] } : null
})
const color = computed(() => {
  const s = props.property.fit_score
  if (s == null) return 'var(--ink-3)'
  if (s >= 70) return 'var(--pos)'
  if (s >= 40) return 'var(--warn)'
  return 'var(--neg)'
})
</script>

<template>
  <div v-if="hasCriteria" class="card">
    <div class="row between">
      <h2>Encaje con vuestros criterios</h2>
      <span v-if="property.fit_score != null" class="fit-score" :style="{ '--c': color }">{{ property.fit_score }}</span>
    </div>
    <div v-if="property.in_zone" class="tiny" style="margin-top: 0.2rem">Dentro de la zona <strong>{{ property.in_zone }}</strong></div>
    <div v-if="notes" class="fit-lists">
      <div v-if="notes.fail.length" class="fit-row neg"><span class="fit-k">No cumple</span><span>{{ notes.fail.join(' · ') }}</span></div>
      <div v-if="notes.missing.length" class="fit-row warn"><span class="fit-k">Falta saber</span><span>{{ notes.missing.join(' · ') }}</span></div>
      <div v-if="notes.ok.length" class="fit-row pos"><span class="fit-k">Cumple</span><span>{{ notes.ok.join(' · ') }}</span></div>
      <div v-if="!notes.fail.length && !notes.missing.length && !notes.ok.length" class="tiny">Sin criterios que comprobar.</div>
    </div>
    <p v-if="property.inbox === 'descartada' && property.discard_reason" class="tiny" style="margin-top: 0.4rem">Se descartó sola al llegar: {{ property.discard_reason }}</p>
  </div>
</template>

<style>
.fit-score { font-family: var(--font-display); font-weight: 700; font-size: 1.3rem; color: var(--c); border: 2px solid var(--c); border-radius: 999px; padding: 0 0.6rem; }
.fit-lists { display: flex; flex-direction: column; gap: 0.3rem; margin-top: 0.6rem; font-size: 0.9rem; }
.fit-row { display: grid; grid-template-columns: 92px 1fr; gap: 0.5rem; }
.fit-k { font-weight: 700; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; }
.fit-row.neg .fit-k { color: var(--neg); }
.fit-row.warn .fit-k { color: var(--warn); }
.fit-row.pos .fit-k { color: var(--pos); }
</style>
