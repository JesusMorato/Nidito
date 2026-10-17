// Ventana de confirmación propia (sustituye al confirm() del navegador, que en
// el iPhone sale con "jesusmorato.github.io dice…"). Se usa como una promesa:
//   if (await confirm({ message: '¿Borrar?' })) …
import { reactive } from 'vue'

export interface ConfirmOptions {
  title?: string
  message: string
  /** Texto del botón que confirma. Por defecto "Borrar". */
  confirmLabel?: string
  /** Botón rojo (borrar). Por defecto true. */
  danger?: boolean
}

const state = reactive<{ open: boolean; opts: ConfirmOptions }>({ open: false, opts: { message: '' } })
let resolver: ((ok: boolean) => void) | null = null

export function useConfirm() {
  function confirm(opts: ConfirmOptions): Promise<boolean> {
    // Si hubiera una abierta, se resuelve como "no" antes de abrir la nueva.
    resolver?.(false)
    state.opts = opts
    state.open = true
    return new Promise((resolve) => { resolver = resolve })
  }
  function answer(ok: boolean) {
    state.open = false
    const r = resolver
    resolver = null
    r?.(ok)
  }
  return { state, confirm, answer }
}
