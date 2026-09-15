import { describe, expect, it } from 'vitest'
import { routinesById, sessionGroupLabel } from '@/lib/sessionGroup'

// The History rows are titled by the workout group (the routine a session was
// run from). sessionGroupLabel resolves the current routine name and degrades
// gracefully for ad-hoc / deleted routines.
describe('sessionGroupLabel', () => {
  const byId = routinesById([
    { id: 'push', name: 'Push' },
    { id: 'pull', name: 'Pull' },
    { id: 'legs', name: 'Legs' },
  ])

  it('returns the routine name for a known routine_id', () => {
    expect(sessionGroupLabel({ routine_id: 'push' }, byId)).toBe('Push')
    expect(sessionGroupLabel({ routine_id: 'legs' }, byId)).toBe('Legs')
  })

  it('falls back to "Workout" for an ad-hoc session (null routine_id)', () => {
    expect(sessionGroupLabel({ routine_id: null }, byId)).toBe('Workout')
  })

  it('falls back to "Workout" when the routine was since deleted', () => {
    expect(sessionGroupLabel({ routine_id: 'gone' }, byId)).toBe('Workout')
  })

  it('falls back when a routine has a blank name', () => {
    const map = routinesById([{ id: 'blank', name: '   ' }])
    expect(sessionGroupLabel({ routine_id: 'blank' }, map)).toBe('Workout')
  })
})

describe('routinesById', () => {
  it('indexes routines by id and tolerates undefined', () => {
    expect(routinesById(undefined).size).toBe(0)
    const map = routinesById([{ id: 'a', name: 'A' }])
    expect(map.get('a')?.name).toBe('A')
  })
})
