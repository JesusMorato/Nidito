<script setup lang="ts">
// Fotos de una casa: miniaturas, añadir (cámara o galería) y borrar.
import { ref } from 'vue'
import type { Photo } from '../types'
import UiIcon from './UiIcon.vue'

defineProps<{ photos: Photo[]; urlOf: (p: Photo) => string; busy?: boolean }>()
const emit = defineEmits<{ (e: 'add', files: File[]): void; (e: 'remove', photo: Photo): void; (e: 'open', photo: Photo): void }>()
const input = ref<HTMLInputElement | null>(null)

function onPick(ev: Event) {
  const files = Array.from((ev.target as HTMLInputElement).files ?? [])
  if (files.length) emit('add', files)
  if (input.value) input.value.value = ''
}
</script>

<template>
  <div class="photo-strip">
    <div v-for="p in photos" :key="p.id" class="photo-thumb">
      <img v-if="urlOf(p)" :src="urlOf(p)" alt="" @click="emit('open', p)" />
      <div v-else class="photo-loading" />
      <button type="button" class="photo-del" aria-label="Borrar foto" @click="emit('remove', p)"><UiIcon name="close" :size="14" /></button>
    </div>
    <button type="button" class="photo-add" :disabled="busy" @click="input?.click()">
      <UiIcon name="plus" :size="22" />
      <span>{{ busy ? 'Subiendo…' : 'Foto' }}</span>
    </button>
    <input ref="input" type="file" accept="image/*" multiple hidden @change="onPick" />
  </div>
</template>

<style>
.photo-strip { display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.3rem; -webkit-overflow-scrolling: touch; }
.photo-thumb { position: relative; flex: none; width: 110px; height: 110px; border-radius: var(--r-md); overflow: hidden; background: var(--surface-2); }
.photo-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; cursor: zoom-in; }
.photo-loading { width: 100%; height: 100%; background: linear-gradient(90deg, var(--surface-2), var(--line), var(--surface-2)); }
.photo-del { position: absolute; top: 4px; right: 4px; width: 26px; height: 26px; padding: 0; border-radius: 50%; background: rgba(0, 0, 0, 0.55); border: 0; color: #fff; }
.photo-add { flex: none; width: 110px; height: 110px; border-radius: var(--r-md); flex-direction: column; gap: 0.2rem; background: var(--surface-2); color: var(--ink-2); border: 1px dashed var(--line); font-size: 0.8rem; }
.photo-view { position: fixed; inset: 0; z-index: 80; background: rgba(0, 0, 0, 0.92); display: grid; place-items: center; }
.photo-view img { max-width: 100vw; max-height: 100dvh; object-fit: contain; }
</style>
