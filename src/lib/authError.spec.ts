import { describe, expect, it } from 'vitest'
import { googleEnabled, readAuthError } from './authError'

describe('readAuthError', () => {
  it('lee el error que Supabase pone tras la #', () => {
    const hash = '#error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance'
    expect(readAuthError('', hash)).toBe('Signups not allowed for this instance')
  })

  it('lee el error de la parte ?', () => {
    expect(readAuthError('?error=server_error&error_description=Algo%20fall%C3%B3', '')).toBe('Algo falló')
  })

  it('usa el código si no hay descripción', () => {
    expect(readAuthError('', '#error=access_denied')).toBe('access_denied')
  })

  it('no ve error en una dirección normal ni tras un login correcto', () => {
    expect(readAuthError('', '#/yo')).toBeNull()
    expect(readAuthError('', '#access_token=abc&refresh_token=def')).toBeNull()
  })
})

describe('googleEnabled', () => {
  it('solo es true si Supabase dice google: true', () => {
    expect(googleEnabled({ external: { google: true, email: true } })).toBe(true)
    expect(googleEnabled({ external: { google: false } })).toBe(false)
    expect(googleEnabled({})).toBe(false)
    expect(googleEnabled(null)).toBe(false)
  })
})
