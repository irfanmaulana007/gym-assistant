import { describe, expect, it } from 'vitest'
import { EMPTY_EXERCISE_FORM } from '@/features/exercises/ExerciseForm'

describe('EMPTY_EXERCISE_FORM defaults', () => {
  it('defaults a new exercise to 3 sets × 12 reps', () => {
    expect(EMPTY_EXERCISE_FORM.target_sets).toBe(3)
    expect(EMPTY_EXERCISE_FORM.target_reps).toBe(12)
  })
})
