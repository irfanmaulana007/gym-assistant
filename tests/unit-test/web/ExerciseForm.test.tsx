import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DISTANCE_UNIT,
  EMPTY_EXERCISE_FORM,
  normalizeExerciseInput,
  normalizeTargets,
} from '@/features/exercises/ExerciseForm'

describe('EMPTY_EXERCISE_FORM defaults', () => {
  it('defaults a new exercise to 3 sets × 12 reps', () => {
    expect(EMPTY_EXERCISE_FORM.target_sets).toBe(3)
    expect(EMPTY_EXERCISE_FORM.target_reps).toBe(12)
  })
})

describe('normalizeExerciseInput — distance', () => {
  it('keeps the distance + unit and nulls sets/reps/duration for a distance exercise', () => {
    const out = normalizeExerciseInput({
      name: '5K Run',
      measurement_type: 'distance',
      target_sets: 3,
      target_reps: 12,
      target_duration_seconds: 1800,
      target_distance: 5,
      distance_unit: 'mi',
    })
    expect(out.measurement_type).toBe('distance')
    expect(out.target_distance).toBe(5)
    expect(out.distance_unit).toBe('mi')
    expect(out.target_sets).toBeNull()
    expect(out.target_reps).toBeNull()
    expect(out.target_duration_seconds).toBeNull()
  })

  it('defaults a distance exercise with no distance/unit to 1 and km', () => {
    const out = normalizeExerciseInput({ name: 'Row', measurement_type: 'distance' })
    expect(out.target_distance).toBe(1)
    expect(out.distance_unit).toBe(DEFAULT_DISTANCE_UNIT)
  })

  it('nulls distance fields for a sets×reps exercise', () => {
    const out = normalizeExerciseInput({
      name: 'Bench',
      measurement_type: 'weight_reps',
      target_sets: 3,
      target_reps: 10,
      target_distance: 5,
      distance_unit: 'km',
    })
    expect(out.target_distance).toBeNull()
    expect(out.distance_unit).toBeNull()
    expect(out.target_sets).toBe(3)
    expect(out.target_reps).toBe(10)
  })
})

describe('normalizeTargets — distance', () => {
  it('emits distance + unit and nulls sets/reps/duration for a distance target', () => {
    const out = normalizeTargets({
      measurement_type: 'distance',
      target_sets: 3,
      target_reps: 12,
      target_duration_seconds: 1800,
      target_distance: 10,
      distance_unit: 'km',
    })
    expect(out.target_distance).toBe(10)
    expect(out.distance_unit).toBe('km')
    expect(out.target_sets).toBeNull()
    expect(out.target_reps).toBeNull()
    expect(out.target_duration_seconds).toBeNull()
  })

  it('nulls distance fields for a non-distance target', () => {
    const out = normalizeTargets({ measurement_type: 'weight_reps', target_sets: 4, target_reps: 8 })
    expect(out.target_distance).toBeNull()
    expect(out.distance_unit).toBeNull()
    expect(out.target_sets).toBe(4)
    expect(out.target_reps).toBe(8)
  })
})
