<script setup lang="ts">
// Cinco estrellas táctiles. Tocar la que ya está puesta la quita.
defineProps<{ value: number | null; readonly?: boolean; color?: string; size?: number }>()
const emit = defineEmits<{ (e: 'change', stars: number | null): void }>()
</script>

<template>
  <div class="stars" :class="{ readonly }" :style="{ '--star-c': color ?? 'var(--star)', '--star-s': `${size ?? 26}px` }" role="radiogroup">
    <button
      v-for="n in 5"
      :key="n"
      type="button"
      class="star"
      :class="{ on: value != null && n <= value }"
      :disabled="readonly"
      :aria-label="`${n} ${n === 1 ? 'estrella' : 'estrellas'}`"
      :aria-pressed="value === n"
      @click="emit('change', value === n ? null : n)"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>
    </button>
  </div>
</template>

<style>
.stars { display: inline-flex; gap: 2px; }
.stars .star { width: calc(var(--star-s) + 6px); height: calc(var(--star-s) + 6px); padding: 0; border: 0; background: transparent; border-radius: 8px; color: var(--line); }
.stars .star svg { width: var(--star-s); height: var(--star-s); fill: currentColor; stroke: none; }
.stars .star.on { color: var(--star-c); }
.stars.readonly .star { cursor: default; opacity: 1; }
.stars .star:not(:disabled):active { transform: scale(0.9); opacity: 1; }
</style>
