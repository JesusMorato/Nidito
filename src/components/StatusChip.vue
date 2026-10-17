<script setup lang="ts">
import type { PropertyStatus } from '../types'
import { statusLabel } from '../types'
import { STATUS_COLOR } from '../lib/status'

defineProps<{ status: PropertyStatus }>()
</script>

<template>
  <span class="status-chip" :style="{ '--c': STATUS_COLOR[status] }">{{ statusLabel(status) }}</span>
</template>

<style>
.status-chip {
  display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.72rem; font-weight: 700; padding: 0.14rem 0.55rem 0.14rem 0.45rem;
  border-radius: 999px; background: color-mix(in srgb, var(--c) 14%, var(--surface)); color: var(--c); white-space: nowrap;
}
.status-chip::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--c); }
</style>
