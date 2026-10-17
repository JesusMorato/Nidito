<script setup lang="ts">
import type { PropertyStatus } from '../types'
import { STATUSES } from '../types'
import { STATUS_COLOR } from '../lib/status'
import Sheet from './Sheet.vue'

defineProps<{ current: PropertyStatus }>()
const emit = defineEmits<{ (e: 'pick', s: PropertyStatus): void; (e: 'close'): void }>()
</script>

<template>
  <Sheet title="¿En qué punto está?" @close="emit('close')">
    <div class="status-grid">
      <button
        v-for="s in STATUSES"
        :key="s.value"
        type="button"
        class="status-opt"
        :class="{ active: s.value === current, out: s.out }"
        :style="{ '--c': STATUS_COLOR[s.value] }"
        @click="emit('pick', s.value)"
      >
        <span class="dot" />{{ s.label }}
      </button>
    </div>
    <p class="help">Descartada y Retirada (ya no está en venta) se pueden poner en cualquier momento; salen de la lista salvo que las enseñes con el filtro.</p>
  </Sheet>
</template>

<style scoped>
.status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.6rem; }
.status-opt { justify-content: flex-start; background: var(--surface-2); color: var(--ink); border: 2px solid transparent; border-radius: var(--r-md); padding: 0.7rem 0.8rem; gap: 0.5rem; }
.status-opt .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--c); flex: none; }
.status-opt.active { border-color: var(--c); background: color-mix(in srgb, var(--c) 12%, var(--surface)); }
.status-opt.out { color: var(--ink-2); }
</style>
