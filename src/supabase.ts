import { createClient } from '@supabase/supabase-js'
import { readAuthError } from './lib/authError'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** false mientras .env no tenga la URL y la clave pública: la app enseña cómo rellenarlas. */
export const configured = Boolean(url && key)

// Se lee antes de crear el cliente y el router, que limpian la dirección.
/** Error con el que vuelve un login con Google fallido (p. ej. cuenta no dada de alta). */
export const oauthError = readAuthError(window.location.search, window.location.hash)

// Sin configurar, el cliente apunta a una dirección falsa: nunca se llama a nada
// porque App.vue corta antes, pero así el resto del código no tiene que comprobarlo.
export const supabase = createClient(url || 'https://sin-configurar.invalid', key || 'sin-configurar')
/** URL y clave pública: las necesitarán el atajo del iPhone y Apps Script (fases 3 y 4). */
export const supabaseUrl: string = url || ''
export const supabaseAnonKey: string = key || ''

// URL a la que Supabase devuelve al usuario tras el login o el enlace de recuperación.
// En producción: https://jesusmorato.github.io/Nidito/
export const authRedirectUrl = `${window.location.origin}${import.meta.env.BASE_URL}`
