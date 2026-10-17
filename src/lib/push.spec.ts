import { describe, expect, it } from 'vitest'
import { claveAplicacion, estadoAvisos, mismaClave, nombreAparato } from './push'

const base = { clave: 'abc', soportado: true, ios: false, instalada: false, permiso: 'default' as const }

describe('estadoAvisos', () => {
  it('sin clave configurada no hay avisos', () => {
    const r = estadoAvisos({ ...base, clave: '' })
    expect(r.disponible).toBe(false)
    expect(r.motivo).toBe('sin-clave')
  })

  it('en iPhone sin instalar explica que hay que añadirla a la pantalla de inicio', () => {
    const r = estadoAvisos({ ...base, ios: true, instalada: false })
    expect(r.motivo).toBe('ios-sin-instalar')
    expect(r.texto).toContain('pantalla de inicio')
  })

  it('en iPhone instalada sí se puede', () => {
    expect(estadoAvisos({ ...base, ios: true, instalada: true }).disponible).toBe(true)
  })

  it('navegador sin soporte', () => {
    expect(estadoAvisos({ ...base, soportado: false }).motivo).toBe('navegador')
  })

  it('permiso denegado se cuenta como bloqueado', () => {
    expect(estadoAvisos({ ...base, permiso: 'denied' }).motivo).toBe('bloqueado')
  })

  it('con permiso ya concedido está disponible', () => {
    expect(estadoAvisos({ ...base, permiso: 'granted' }).disponible).toBe(true)
  })

  it('la falta de clave manda sobre todo lo demás', () => {
    expect(estadoAvisos({ clave: '', soportado: false, ios: true, instalada: false, permiso: 'denied' }).motivo).toBe('sin-clave')
  })
})

describe('claveAplicacion', () => {
  it('descifra base64url sin relleno', () => {
    // "hola" en base64 es "aG9sYQ==" (sin relleno, "aG9sYQ")
    expect(Array.from(claveAplicacion('aG9sYQ'))).toEqual([104, 111, 108, 97])
  })
  it('acepta los caracteres - y _ propios de base64url', () => {
    const bytes = claveAplicacion('_-8')
    expect(bytes.length).toBe(2)
    expect(bytes[0]).toBe(255)
  })
  it('ignora espacios alrededor', () => {
    expect(Array.from(claveAplicacion('  aG9sYQ  '))).toEqual([104, 111, 108, 97])
  })
})

describe('nombreAparato', () => {
  it('reconoce los aparatos habituales', () => {
    expect(nombreAparato('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('iPhone')
    expect(nombreAparato('Mozilla/5.0 (Linux; Android 14)')).toBe('Android')
    expect(nombreAparato('Mozilla/5.0 (Windows NT 10.0)')).toBe('Windows')
    expect(nombreAparato('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe('Mac')
  })
  it('lo que no conoce se queda en genérico', () => {
    expect(nombreAparato('algo raro')).toBe('Este navegador')
  })
})

describe('mismaClave', () => {
  it('reconoce la clave con la que se pidió el permiso', () => {
    expect(mismaClave(claveAplicacion('aG9sYQ').buffer as ArrayBuffer, 'aG9sYQ')).toBe(true)
  })
  it('detecta que la clave del servidor ha cambiado', () => {
    expect(mismaClave(claveAplicacion('aG9sYQ').buffer as ArrayBuffer, 'YWRpb3M')).toBe(false)
  })
  it('sin permiso previo o sin clave, no coincide', () => {
    expect(mismaClave(null, 'aG9sYQ')).toBe(false)
    expect(mismaClave(claveAplicacion('aG9sYQ').buffer as ArrayBuffer, '')).toBe(false)
  })
})
