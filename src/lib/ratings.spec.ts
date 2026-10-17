import { describe, expect, it } from 'vitest'
import type { Aspect, Rating } from '../types'
import { formatScore, summarise, summariseAll } from './ratings'

const A = 'ana', L = 'luis'
const aspects: Aspect[] = [
  { id: 'luz', household_id: 'h', name: 'Luz', sort_order: 1, active: true, created_at: '' },
  { id: 'estado', household_id: 'h', name: 'Estado', sort_order: 2, active: true, created_at: '' },
  { id: 'viejo', household_id: 'h', name: 'Antiguo', sort_order: 3, active: false, created_at: '' },
]
const r = (user: string, aspect: string, stars: number, property = 'p1'): Rating => ({ property_id: property, user_id: user, aspect_id: aspect, stars, comment: null, updated_at: '' })

describe('summarise', () => {
  it('sin valoraciones no hay notas', () => {
    const s = summarise([], aspects, A, L)
    expect(s).toMatchObject({ mine: null, partner: null, joint: null, disagreement: null, ratedByMe: false, ratedByPartner: false, myCount: 0 })
  })
  it('calcula mi nota, la de mi pareja y la conjunta', () => {
    const s = summarise([r(A, 'luz', 5), r(A, 'estado', 3), r(L, 'luz', 2), r(L, 'estado', 4)], aspects, A, L)
    expect(s.mine).toBe(4)
    expect(s.partner).toBe(3)
    expect(s.joint).toBe(3.5)
    expect(s.disagreement).toBe(3)
    expect(s.disagreedAspects).toEqual(['Luz'])
    expect(s.myCount).toBe(2)
  })
  it('si solo ha puntuado uno, la conjunta es su nota y no hay desacuerdo', () => {
    const s = summarise([r(A, 'luz', 4)], aspects, A, L)
    expect(s.joint).toBe(4)
    expect(s.disagreement).toBeNull()
    expect(s.ratedByPartner).toBe(false)
  })
  it('ignora los aspectos desactivados', () => {
    const s = summarise([r(A, 'viejo', 1), r(A, 'luz', 5)], aspects, A, L)
    expect(s.mine).toBe(5)
    expect(s.myCount).toBe(1)
  })
  it('sin pareja todavía, solo cuenta lo mío', () => {
    const s = summarise([r(A, 'luz', 5), r('otro', 'luz', 1)], aspects, A, null)
    expect(s.partner).toBeNull()
    expect(s.joint).toBe(5)
  })
})

describe('summariseAll y formatScore', () => {
  it('agrupa por casa', () => {
    const all = summariseAll([r(A, 'luz', 5), r(A, 'luz', 1, 'p2')], aspects, A, L)
    expect(all.p1.mine).toBe(5)
    expect(all.p2.mine).toBe(1)
  })
  it('formatea con coma', () => {
    expect(formatScore(3.5)).toBe('3,5')
    expect(formatScore(null)).toBe('—')
  })
})
