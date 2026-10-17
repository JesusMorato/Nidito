// Aviso breve en la parte baja de la pantalla ("Casa guardada", "No se ha podido…").
// Global: cualquier vista lo llama y App.vue lo pinta.
import { reactive } from 'vue'

const state = reactive<{ text: string | null }>({ text: null })
let timer: ReturnType<typeof setTimeout> | null = null

export function useToast() {
  function toast(text: string, ms = 2600) {
    state.text = text
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { state.text = null }, ms)
  }
  return { state, toast }
}
