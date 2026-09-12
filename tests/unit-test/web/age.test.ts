import { describe, expect, it } from 'vitest'
import { ageFrom } from '@/lib/age'

// Age is derived from DOB, never stored (PRD 0008).
describe('ageFrom', () => {
  const now = new Date('2026-09-12T00:00:00Z')

  it('computes whole years, accounting for the birthday not yet reached', () => {
    expect(ageFrom('1990-05-15', now)).toBe(36) // birthday passed this year
    expect(ageFrom('1990-12-25', now)).toBe(35) // birthday still ahead this year
  })

  it('handles an ISO datetime DOB', () => {
    expect(ageFrom('1992-03-04T00:00:00Z', now)).toBe(34)
  })

  it('returns null for missing or unparseable input', () => {
    expect(ageFrom(null, now)).toBeNull()
    expect(ageFrom(undefined, now)).toBeNull()
    expect(ageFrom('not-a-date', now)).toBeNull()
  })
})
