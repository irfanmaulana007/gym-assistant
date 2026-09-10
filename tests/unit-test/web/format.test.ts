import { describe, expect, it } from 'vitest'
import { formatDuration, formatTarget, formatDate, formatLastSet } from '@/lib/format'

describe('formatDuration', () => {
  it('formats under an hour as MM:SS', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(65)).toBe('01:05')
    expect(formatDuration(600)).toBe('10:00')
  })
  it('formats an hour or more as H:MM:SS', () => {
    expect(formatDuration(3661)).toBe('1:01:01')
  })
  it('guards against negatives', () => {
    expect(formatDuration(-5)).toBe('00:00')
  })
})

describe('formatTarget', () => {
  it('shows sets×reps for strength', () => {
    expect(formatTarget('weight_reps', 4, 8, null)).toBe('4×8')
  })
  it('shows a duration for timed work', () => {
    expect(formatTarget('duration', null, null, 1800)).toBe('30:00')
  })
  it('falls back to a dash when nothing applies', () => {
    expect(formatTarget('weight_reps', null, null, null)).toBe('—')
  })
})

describe('formatLastSet', () => {
  it('formats the previous top set as weight × reps', () => {
    expect(formatLastSet({ weight: 60, weight_unit: 'kg', reps: 8 })).toBe('60kg × 8')
    expect(formatLastSet({ weight: 62.5, weight_unit: 'lb', reps: 10 })).toBe('62.5lb × 10')
  })
  it('returns null when there is no previous set', () => {
    expect(formatLastSet(null)).toBeNull()
    expect(formatLastSet(undefined)).toBeNull()
  })
})

describe('formatDate', () => {
  it('formats an ISO date', () => {
    expect(formatDate('2026-09-02T09:12:00Z')).toMatch(/2026/)
  })
})
