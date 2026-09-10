import { describe, expect, it } from 'vitest'
import { initialsFor } from '@/lib/initials'

describe('initialsFor', () => {
  it('takes first + last initial for multi-word names', () => {
    expect(initialsFor('Jane Doe')).toBe('JD')
    expect(initialsFor('Mary Jane Watson')).toBe('MW')
  })

  it('takes the first two letters for a single word', () => {
    expect(initialsFor('Arnold')).toBe('AR')
  })

  it('falls back to ? for empty input', () => {
    expect(initialsFor('')).toBe('?')
    expect(initialsFor('   ')).toBe('?')
  })

  it('handles surrounding whitespace', () => {
    expect(initialsFor('  Jane   Doe  ')).toBe('JD')
  })
})
