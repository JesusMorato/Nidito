<script setup lang="ts">
import { computed } from 'vue'
import { UI_ICONS, type UiIconName } from '../lib/uiIcons'

const props = withDefaults(defineProps<{ name: UiIconName; size?: number }>(), { size: 20 })
const svg = computed(() => UI_ICONS[props.name])
</script>

<template>
  <svg
    class="ui-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="svg"
  />
</template>
