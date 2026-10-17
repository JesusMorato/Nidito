<script setup lang="ts">
// Logo de Nidito: una casita dentro de un nido.
//  - mark: sobre fondo transparente (barra superior, pantalla de entrada)
//  - tile: baldosa terracota (icono de la app; el mismo dibujo que scripts/make-icons.mjs)
withDefaults(defineProps<{ variant?: 'mark' | 'tile'; size?: number }>(), { variant: 'mark', size: 28 })
</script>

<template>
  <svg v-if="variant === 'tile'" :width="size" :height="size" viewBox="0 0 200 200" aria-hidden="true">
    <rect width="200" height="200" rx="44" fill="#b0583c" />
    <ellipse cx="100" cy="118" rx="62" ry="13" fill="#e8c9b2" />
    <rect x="72" y="76" width="56" height="48" fill="#ffffff" />
    <polygon points="100,42 60,82 140,82" fill="#2f6b73" />
    <rect x="92" y="98" width="16" height="26" rx="3" fill="#b0583c" />
    <path d="M38 118 Q100 150 162 118 L152 154 Q100 182 48 154 Z" fill="#fbe9d8" />
    <path d="M56 136 Q100 162 144 136" fill="none" stroke="#e8c9b2" stroke-width="4" stroke-linecap="round" />
    <path d="M64 150 Q100 172 136 150" fill="none" stroke="#e8c9b2" stroke-width="4" stroke-linecap="round" />
  </svg>
  <svg v-else :width="size" :height="size" viewBox="0 0 200 200" aria-hidden="true">
    <ellipse cx="100" cy="118" rx="62" ry="13" fill="#b9895a" />
    <rect x="72" y="76" width="56" height="48" fill="var(--surface, #ffffff)" stroke="var(--casa, #b0583c)" stroke-width="5" stroke-linejoin="round" />
    <polygon points="100,42 60,82 140,82" fill="var(--casa, #b0583c)" />
    <rect x="92" y="98" width="16" height="26" rx="3" fill="var(--pareja, #2f6b73)" />
    <path d="M38 118 Q100 150 162 118 L152 154 Q100 182 48 154 Z" fill="#d4a574" />
    <path d="M56 136 Q100 162 144 136" fill="none" stroke="#b9895a" stroke-width="4" stroke-linecap="round" />
    <path d="M64 150 Q100 172 136 150" fill="none" stroke="#b9895a" stroke-width="4" stroke-linecap="round" />
  </svg>
</template>
