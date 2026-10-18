// Estado global de sesión: usuario, hogar y miembros.
// Es un "composable" sencillo con reactive(); no hace falta Pinia para dos usuarios.
import { computed, reactive, readonly } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, authRedirectUrl } from '../supabase'
import type { Household, Member } from '../types'
import { clearSnapshots, isNetworkError, loadSnapshot, saveSnapshot } from '../lib/offline'
import { resetData } from './useData'

interface State {
  ready: boolean
  user: User | null
  household: Household | null
  members: Member[]
  error: string | null
  /** true mientras el usuario viene del enlace de "olvidé mi contraseña" */
  recovery: boolean
}

const state = reactive<State>({
  ready: false,
  user: null,
  household: null,
  members: [],
  error: null,
  recovery: false,
})

let initialised = false

/** Carga hogar y miembros del usuario dado, sin tocar el estado hasta tener todo. */
async function fetchHousehold(user: User | null): Promise<{ household: Household | null; members: Member[] }> {
  if (!user) return { household: null, members: [] }
  const key = `hogar:${user.id}`
  const { data: rows, error } = await supabase
    .from('household_members')
    .select('*')
    .order('joined_at', { ascending: true })
  if (error) {
    // Sin red: el hogar guardado de la última vez, para no mandar a "Casi listo".
    const copy = loadSnapshot<{ household: Household | null; members: Member[] }>(key)
    if (isNetworkError(error) && copy) return copy.value
    state.error = error.message
    return { household: null, members: [] }
  }
  const members = (rows ?? []) as Member[]
  const mine = members.find((m) => m.user_id === user.id)
  if (!mine) return { household: null, members }
  const { data: h } = await supabase.from('households').select('*').eq('id', mine.household_id).single()
  const out = { household: (h as Household) ?? null, members }
  if (out.household) saveSnapshot(key, out)
  return out
}

async function loadHousehold() {
  const r = await fetchHousehold(state.user)
  state.household = r.household
  state.members = r.members
}

// Usuario y hogar se asignan a la vez, ya cargados: así el router nunca ve
// "hay usuario pero aún no sé si tiene hogar" y no manda a "Casi listo" por error.
let syncing: Promise<void> | null = null
function applySession(session: Session | null): Promise<void> {
  const p = (async () => {
    const user = session?.user ?? null
    // Otro usuario (o nadie) en el mismo navegador: fuera los datos del anterior.
    if (state.user && state.user.id !== user?.id) resetData()
    const r = await fetchHousehold(user)
    state.user = user
    state.household = r.household
    state.members = r.members
    state.ready = true
  })()
  syncing = p
  p.finally(() => { if (syncing === p) syncing = null })
  return p
}

/** Espera a que termine la sincronización de sesión en curso (si la hay). */
export function whenSessionSettled(): Promise<void> {
  return syncing ?? Promise.resolve()
}

export function useSession() {
  if (!initialised) {
    initialised = true
    supabase.auth.getSession().then(({ data }) => applySession(data.session))
    supabase.auth.onAuthStateChange((event, session) => {
      // No hacemos await aquí: Supabase recomienda no bloquear este callback.
      if (event === 'PASSWORD_RECOVERY') state.recovery = true
      // Un simple refresco del token no cambia nada: no hace falta volver a pedir el hogar.
      if (event === 'TOKEN_REFRESHED' && state.ready && session?.user?.id === state.user?.id) return
      applySession(session)
    })
  }

  const me = computed(() => state.members.find((m) => m.user_id === state.user?.id) ?? null)
  const partner = computed(() => state.members.find((m) => m.user_id !== state.user?.id) ?? null)
  const memberIds = computed(() => state.members.map((m) => m.user_id))

  function nameOf(userId: string): string {
    return state.members.find((m) => m.user_id === userId)?.display_name ?? 'Alguien'
  }

  async function signOut() {
    clearSnapshots()
    resetData()
    await supabase.auth.signOut()
    state.user = null
    state.household = null
    state.members = []
  }

  async function renameHousehold(name: string) {
    if (!state.household) return
    const { error } = await supabase.from('households').update({ name: name.trim() }).eq('id', state.household.id)
    if (error) throw new Error(error.message)
    await loadHousehold()
  }

  async function renameMe(displayName: string) {
    if (!state.user) return
    const { error } = await supabase
      .from('household_members')
      .update({ display_name: displayName.trim() })
      .eq('user_id', state.user.id)
    if (error) throw new Error(error.message)
    await loadHousehold()
  }

  /** Envía el email de "olvidé mi contraseña". El enlace vuelve a la app. */
  async function requestPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectUrl })
    if (error) throw new Error(error.message)
  }

  function endRecovery() {
    state.recovery = false
  }

  return {
    requestPasswordReset,
    endRecovery,
    state: readonly(state),
    me,
    partner,
    memberIds,
    nameOf,
    refresh: loadHousehold,
    signOut,
    renameHousehold,
    renameMe,
  }
}
