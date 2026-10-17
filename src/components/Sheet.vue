<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { lockScroll, unlockScroll } from '../lib/scrollLock'
import UiIcon from './UiIcon.vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

// Mientras la hoja está abierta, la página de detrás no se mueve.
onMounted(lockScroll)
onBeforeUnmount(unlockScroll)

// Solo se cierra al tocar el fondo si el toque EMPIEZA y TERMINA en el fondo.
// Antes, arrastrar desde dentro de la hoja (seleccionar texto, mover un
// deslizador) y soltar fuera la cerraba sin querer.
let pressedOnBackdrop = false
function onDown(ev: PointerEvent) {
  pressedOnBackdrop = ev.target === ev.currentTarget
}
function onClick(ev: MouseEvent) {
  if (pressedOnBackdrop && ev.target === ev.currentTarget) emit('close')
  pressedOnBackdrop = false
}
</script>

<template>
  <div class="sheet-backdrop" @pointerdown="onDown" @click="onClick">
    <div class="sheet" role="dialog" aria-modal="true" :aria-label="title">
      <div class="handle" />
      <header>
        <h2>{{ title }}</h2>
        <button type="button" class="icon" aria-label="Cerrar" @click="emit('close')"><UiIcon name="close" /></button>
      </header>
      <slot />
    </div>
  </div>
</template>
