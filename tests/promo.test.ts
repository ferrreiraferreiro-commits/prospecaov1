import { describe, expect, it } from 'vitest'
import { semanaGratis } from '../src/lib/promo'

describe('semana grátis', () => {
  it('vale até o fim de 19/10 (Brasília) e some sozinha depois', () => {
    expect(semanaGratis(Date.parse('2026-10-12T12:00:00-03:00'))).toBe(true)
    expect(semanaGratis(Date.parse('2026-10-19T23:59:00-03:00'))).toBe(true)
    expect(semanaGratis(Date.parse('2026-10-20T00:00:01-03:00'))).toBe(false)
  })
})
