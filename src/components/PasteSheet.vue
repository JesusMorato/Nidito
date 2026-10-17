<script setup lang="ts">
// "Pegar texto del anuncio": el lector saca los datos y abre el formulario ya relleno.
import { ref } from 'vue'
import { parseListing } from '../lib/parseListing'
import type { PropertyInput } from '../types'
import Sheet from './Sheet.vue'

const emit = defineEmits<{ (e: 'parsed', input: PropertyInput): void; (e: 'close'): void }>()
const text = ref('')

async function pasteFromClipboard() {
  try {
    text.value = await navigator.clipboard.readText()
  } catch {
    // Sin permiso: se pega a mano en el cuadro.
  }
}

function read() {
  if (!text.value.trim()) return
  emit('parsed', parseListing(text.value))
}
</script>

<template>
  <Sheet title="Pegar texto del anuncio" @close="emit('close')">
    <p class="muted">Copia la descripción del portal o el mensaje de la inmobiliaria y pégalo aquí. Nidito saca precio, metros, habitaciones, dirección y extras; lo que no encuentre lo rellenas tú.</p>
    <div class="field">
      <textarea v-model="text" rows="8" placeholder="Piso en venta en calle… 385.000 € · 92 m² · 3 hab…" />
    </div>
    <div class="row" style="justify-content: space-between">
      <button type="button" class="ghost small" @click="pasteFromClipboard">Pegar del portapapeles</button>
      <button type="button" :disabled="!text.trim()" @click="read">Leer y continuar</button>
    </div>
  </Sheet>
</template>
