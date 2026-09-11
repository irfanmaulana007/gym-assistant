import { describe, expect, it } from 'vitest'
import { describeTarget, formatDuration, formatTarget, formatDate, formatLastSet } from '@/lib/format'
import type { Exercise } from '@/types/api'

// Minimal Exercise builder — describeTarget only reads the target/measurement fields.
function ex(partial: Partial<Exercise>): Exercise {
  return {
    id: 'e', routine_id: 'r', name: 'X', measurement_type: 'weight_reps',
    target_sets: null, target_reps: null, target_weight: null,
    target_duration_seconds: null, target_distance: null, distance_unit: null,
    primary_muscle_group: 'chest', secondary_muscle_groups: [], default_metadata: {},
    notes: '', position: 0, created_at: '', updated_at: '', catalog_exercise_id: null,
    ...partial,
  }
}

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

describe('describeTarget', () => {
  it('shows sets×reps with the target weight for strength', () => {
    expect(describeTarget(ex({ measurement_type: 'weight_reps', target_sets: 3, target_reps: 12, target_weight: 40 }))).toBe('3×12 @ 40kg')
  })
  it('shows sets×reps without weight when no target weight is set', () => {
    expect(describeTarget(ex({ measurement_type: 'weight_reps', target_sets: 4, target_reps: 8 }))).toBe('4×8')
  })
  it('shows reps for reps-only work', () => {
    expect(describeTarget(ex({ measurement_type: 'reps_only', target_reps: 15 }))).toBe('15 reps')
  })
  it('shows a duration for timed work', () => {
    expect(describeTarget(ex({ measurement_type: 'duration', target_duration_seconds: 1800 }))).toBe('30:00')
  })
  it('shows distance with its unit', () => {
    expect(describeTarget(ex({ measurement_type: 'distance', target_distance: 5, distance_unit: 'km' }))).toBe('5km')
  })
  it('falls back to a dash when nothing applies', () => {
    expect(describeTarget(ex({ measurement_type: 'weight_reps' }))).toBe('—')
    expect(describeTarget(ex({ measurement_type: 'distance' }))).toBe('—')
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
