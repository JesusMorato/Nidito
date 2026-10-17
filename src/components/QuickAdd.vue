<script setup lang="ts">
import Sheet from './Sheet.vue'
import UiIcon from './UiIcon.vue'

const emit = defineEmits<{ (e: 'manual'): void; (e: 'paste'): void; (e: 'close'): void }>()
</script>

<template>
  <Sheet title="Añadir casa" @close="emit('close')">
    <div class="quick space-yo">
      <button type="button" @click="emit('paste')">
        <span class="quick-icon"><UiIcon name="copy" :size="22" /></span>
        <span>Pegar texto del anuncio<small>Del portal, del correo o de un WhatsApp. Lo rellena casi todo.</small></span>
      </button>
      <button type="button" @click="emit('manual')">
        <span class="quick-icon"><UiIcon name="pencil" :size="22" /></span>
        <span>A mano<small>Una llamada, un cartel, una visita.</small></span>
      </button>
    </div>
  </Sheet>
</template>

<style>
.quick { display: grid; gap: 0.5rem; }
.quick button { justify-content: flex-start; background: var(--surface-2); color: var(--ink); border-color: transparent; padding: 0.8rem 0.9rem; border-radius: var(--r-md); text-align: left; gap: 0.75rem; }
.quick button small { display: block; color: var(--ink-2); font-weight: 500; font-size: 0.8rem; }
.quick-icon { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; flex: none; background: var(--accent-soft); color: var(--accent-ink); }
</style>
