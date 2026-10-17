<script setup lang="ts">
// Fase 0: la lista con orden y filtros llega en la fase 1.
import EmptyState from '../components/EmptyState.vue'
</script>

<template>
  <div class="space-yo stack">
    <h1>Casas</h1>
    <div class="card">
      <EmptyState kind="casas">
        <strong>Aún no hay casas.</strong><br />
        Aquí las verás en una lista que podréis ordenar por precio, m², nota o zona.
      </EmptyState>
    </div>
  </div>
</template>
