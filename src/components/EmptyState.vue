<script setup lang="ts">
// Pantallas vacías con ilustraciones planas (sin trazo), como en GasTitos.
defineProps<{ kind: 'casas' | 'pareja' }>()
</script>

<template>
  <div class="empty">
    <!-- Nido vacío con una casita esperando: sin casas todavía -->
    <svg v-if="kind === 'casas'" width="120" height="103" viewBox="0 0 140 120" aria-hidden="true">
      <ellipse cx="70" cy="110" rx="46" ry="6" fill="var(--surface-2)" />
      <ellipse cx="70" cy="78" rx="44" ry="9" fill="#b9895a" />
      <path d="M26 78 Q70 100 114 78 L106 102 Q70 120 34 102 Z" fill="#d4a574" />
      <path d="M40 90 Q70 108 100 90" fill="none" stroke="#b9895a" stroke-width="3" stroke-linecap="round" />
      <rect x="54" y="46" width="32" height="30" fill="var(--surface)" stroke="var(--casa)" stroke-width="3" stroke-linejoin="round" />
      <polygon points="70,24 46,50 94,50" fill="var(--casa)" />
      <rect x="65" y="60" width="10" height="16" rx="2" fill="var(--pareja)" />
    </svg>
    <!-- Dos personas: invita a tu pareja -->
    <svg v-else width="120" height="103" viewBox="0 0 140 120" aria-hidden="true">
      <ellipse cx="70" cy="110" rx="46" ry="6" fill="var(--surface-2)" />
      <circle cx="50" cy="44" r="16" fill="var(--casa)" />
      <path d="M22 100c0-18 12-30 28-30s28 12 28 30z" fill="var(--casa)" />
      <circle cx="94" cy="50" r="14" fill="var(--pareja)" />
      <path d="M70 100c0-16 10-26 24-26s24 10 24 26z" fill="var(--pareja)" />
      <circle cx="121" cy="24" r="12" fill="#e9b949" />
      <path d="M121 18v12M115 24h12" fill="none" stroke="var(--surface)" stroke-width="3" stroke-linecap="round" />
    </svg>
    <slot />
  </div>
</template>
