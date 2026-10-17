<script setup lang="ts">
import { useConfirm } from '../composables/useConfirm'
import Sheet from './Sheet.vue'

const { state, answer } = useConfirm()
</script>

<template>
  <Sheet v-if="state.open" :title="state.opts.title ?? '¿Seguro?'" @close="answer(false)">
    <p class="muted" style="margin-bottom: 1rem">{{ state.opts.message }}</p>
    <div class="row" style="justify-content: flex-end">
      <button type="button" class="ghost" @click="answer(false)">Cancelar</button>
      <button type="button" :class="state.opts.danger === false ? '' : 'danger-solid'" @click="answer(true)">{{ state.opts.confirmLabel ?? 'Borrar' }}</button>
    </div>
  </Sheet>
</template>
