<script setup lang="ts">
// Distancia de la casa a cada lugar importante, con enlace a Google Maps en transporte.
import { computed } from 'vue'
import { useData } from '../composables/useData'
import { distanceM, formatDistance, walkingMinutes } from '../lib/geo'
import type { Property } from '../types'

const props = defineProps<{ property: Property }>()
const data = useData()
const rows = computed(() => {
  if (props.property.lat == null || props.property.lng == null) return []
  const from = { lat: props.property.lat, lng: props.property.lng }
  return data.places.value.map((pl) => {
    const m = distanceM(from, pl)
    return { id: pl.id, name: pl.name, m, url: `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${pl.lat},${pl.lng}&travelmode=transit` }
  }).sort((a, b) => a.m - b.m)
})
</script>

<template>
  <div v-if="rows.length" class="card">
    <h2>Lugares importantes</h2>
    <ul class="list" style="margin-top: 0.4rem">
      <li v-for="r in rows" :key="r.id">
        <span class="grow">{{ r.name }}</span>
        <span class="tiny" style="white-space: nowrap">{{ formatDistance(r.m) }} en línea recta{{ r.m < 3000 ? ` · ${walkingMinutes(r.m)} min andando` : '' }}</span>
        <a :href="r.url" target="_blank" rel="noopener" class="btn ghost small">Transporte</a>
      </li>
    </ul>
  </div>
</template>
