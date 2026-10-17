<script setup lang="ts">
// Fase 0: el mapa llega en la fase 1 (Leaflet sobre OpenStreetMap). De momento,
// la pantalla vacía explica qué va a haber aquí.
import { useSession } from '../composables/useSession'
import EmptyState from '../components/EmptyState.vue'

const { partner, state } = useSession()
</script>

<template>
  <div class="space-yo map-placeholder">
    <div class="card">
      <EmptyState v-if="partner" kind="casas">
        <strong>Aún no hay casas.</strong><br />
        Aquí verás cada casa como un pin con su precio. Pulsa ➕ para añadir la primera.
      </EmptyState>
      <EmptyState v-else kind="pareja">
        <strong>Invita a tu pareja.</strong><br />
        Código de invitación: <span class="code-invite">{{ state.household?.invite_code }}</span><br />
        <span class="tiny">En su primera entrada elegirá “Unirme con código”.</span>
      </EmptyState>
    </div>
  </div>
</template>

<style scoped>
.map-placeholder { padding: 12px 16px; max-width: 680px; margin: 0 auto; width: 100%; }
</style>
