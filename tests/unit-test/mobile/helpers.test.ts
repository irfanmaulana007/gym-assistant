import { describe, expect, it } from 'vitest'
import { convertWeight, convertHeight, formatWeight } from '@/lib/units'
import { formatDuration, formatTarget, formatLastSet } from '@/lib/format'
import { ageFrom } from '@/lib/age'
import { initialsFor } from '@/lib/initials'
import { routinesById, sessionGroupLabel } from '@/lib/sessionGroup'
import { sessionMuscleUsage } from '@/lib/sessionMuscles'
import { buildMuscleLayers, buildMuscleUsageLayers, buildMuscleDiagramUrl } from '@/lib/muscleDiagram'
import type { WorkoutSession } from '@/types/api'

describe('units', () => {
  it('converts kg↔lb rounded to one decimal, identity same-unit', () => {
    expect(convertWeight(100, 'kg', 'kg')).toBe(100)
    expect(convertWeight(100, 'kg', 'lb')).toBe(220.5)
    expect(convertWeight(220.5, 'lb', 'kg')).toBe(100)
    expect(convertHeight(180, 'cm', 'in')).toBe(70.9)
    expect(formatWeight(100, 'kg', 'lb')).toBe('220.5lb')
  })
})

describe('format', () => {
  it('formats durations and targets', () => {
    expect(formatDuration(65)).toBe('01:05')
    expect(formatDuration(3661)).toBe('1:01:01')
    expect(formatTarget('weight_reps', 4, 8)).toBe('4×8')
    expect(formatTarget('duration', null, null, 1800)).toBe('30:00')
  })
  it('formats the last set, converting to the preferred unit', () => {
    expect(formatLastSet({ weight: 100, weight_unit: 'kg', reps: 8 }, 'lb')).toBe('220.5lb × 8')
    expect(formatLastSet(null)).toBeNull()
  })
})

describe('age', () => {
  it('derives whole years with an injectable now', () => {
    expect(ageFrom('2000-06-15', new Date('2026-06-14'))).toBe(25)
    expect(ageFrom('2000-06-15', new Date('2026-06-15'))).toBe(26)
    expect(ageFrom(null)).toBeNull()
  })
})

describe('initials', () => {
  it('derives up to two letters', () => {
    expect(initialsFor('Irfan Maulana')).toBe('IM')
    expect(initialsFor('Cher')).toBe('CH')
    expect(initialsFor('   ')).toBe('?')
  })
})

describe('sessionGroup', () => {
  it('resolves the routine name or falls back to Workout', () => {
    const map = routinesById([{ id: 'r1', name: 'Push Day' }])
    expect(sessionGroupLabel({ routine_id: 'r1' }, map)).toBe('Push Day')
    expect(sessionGroupLabel({ routine_id: 'gone' }, map)).toBe('Workout')
    expect(sessionGroupLabel({ routine_id: null }, map)).toBe('Workout')
  })
})

describe('sessionMuscles', () => {
  it('credits primary + secondary groups, optionally excluding cardio', () => {
    const session = {
      exercises: [
        { primary_muscle_group: 'chest', secondary_muscle_groups: ['triceps'], sets_completed: 3 },
        { primary_muscle_group: 'cardio', secondary_muscle_groups: [], sets_completed: 2 },
      ],
    } as unknown as WorkoutSession
    const withCardio = sessionMuscleUsage(session)
    expect(withCardio.find((s) => s.muscle_group === 'chest')?.sets).toBe(3)
    expect(withCardio.find((s) => s.muscle_group === 'triceps')?.sets).toBe(3)
    expect(withCardio.find((s) => s.muscle_group === 'cardio')?.sets).toBe(2)
    const noCardio = sessionMuscleUsage(session, { includeCardio: false })
    expect(noCardio.find((s) => s.muscle_group === 'cardio')).toBeUndefined()
  })
})

describe('muscleDiagram', () => {
  it('builds anatome layers with primary winning over secondary', () => {
    expect(buildMuscleLayers('chest', ['triceps'])).toBe('DC2626:chest|F59E0B:triceps')
    // full_body has no anatomical mapping → null (fall back to text badges)
    expect(buildMuscleLayers('full_body', [])).toBeNull()
  })
  it('colors usage by share of the most-trained group', () => {
    const layers = buildMuscleUsageLayers([
      { muscle_group: 'chest', sets: 10 },
      { muscle_group: 'biceps', sets: 2 },
    ])
    // chest is the max (red DC2626); biceps 2/10=0.2 → yellow FDE047
    expect(layers).toContain('DC2626:chest')
    expect(layers).toContain('FDE047:biceps')
  })
  it('composes a raw dual-view generateImage url against the configured base', () => {
    const url = buildMuscleDiagramUrl('chest', [], { baseUrl: 'https://api.anatome.dev' })
    expect(url).toBe('https://api.anatome.dev/generateImage?view=dual&output=raw&layers=DC2626%3Achest')
  })
})
