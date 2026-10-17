// Editor global de casas: el botón ➕ de App.vue y las vistas comparten el mismo
// formulario (como el editor de gastos de GasTitos).
import { reactive } from 'vue'
import type { Property, PropertyInput } from '../types'

interface EditorState {
  /** Menú rápido: "A mano" / "Pegar texto". */
  quickOpen: boolean
  /** Hoja de pegar texto. */
  pasteOpen: boolean
  /** Formulario abierto. */
  formOpen: boolean
  /** Casa que se edita (null = nueva). */
  editing: Property | null
  /** Datos de partida para una casa nueva (lo que sacó el lector de texto). */
  prefill: PropertyInput | null
  saving: boolean
}

const state = reactive<EditorState>({ quickOpen: false, pasteOpen: false, formOpen: false, editing: null, prefill: null, saving: false })

export function useEditor() {
  function openQuick() {
    state.quickOpen = true
  }
  function openNew(prefill: PropertyInput | null = null) {
    state.quickOpen = false
    state.pasteOpen = false
    state.editing = null
    state.prefill = prefill
    state.formOpen = true
  }
  function openEdit(p: Property) {
    state.quickOpen = false
    state.editing = p
    state.prefill = null
    state.formOpen = true
  }
  function openPaste() {
    state.quickOpen = false
    state.pasteOpen = true
  }
  function close() {
    state.quickOpen = false
    state.pasteOpen = false
    state.formOpen = false
    state.editing = null
    state.prefill = null
  }
  return { state, openQuick, openNew, openEdit, openPaste, close }
}
