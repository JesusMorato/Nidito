<script setup lang="ts" generic="T extends string">
defineProps<{ options: ReadonlyArray<{ value: T; label: string }>; modelValue: T; small?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: T): void }>()
</script>

<template>
  <div class="segmented" :class="{ small }" role="tablist">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      role="tab"
      :aria-selected="o.value === modelValue"
      :class="{ active: o.value === modelValue }"
      @click="emit('update:modelValue', o.value)"
    >{{ o.label }}</button>
  </div>
</template>
