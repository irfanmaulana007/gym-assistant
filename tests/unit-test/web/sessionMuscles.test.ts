import { describe, expect, it } from 'vitest'
import { sessionMuscleUsage } from '@/lib/sessionMuscles'
import type { SessionExercise, WorkoutSession } from '@/types/api'

// PRD 0012 — the session summary's body heatmap is driven by sets-per-muscle.
// Each exercise credits its completed sets to its primary group AND each of its
// secondary groups, summed across the session.

function exercise(partial: Partial<SessionExercise>): SessionExercise {
  return {
    id: 'x',
    session_id: 's',
    exercise_id: 'e',
    position: 0,
    name_snapshot: 'Ex',
    measurement_type: 'weight_reps',
    target_sets: null,
    target_reps: null,
    target_weight: null,
    target_duration_seconds: null,
    primary_muscle_group: 'chest',
    secondary_muscle_groups: [],
    status: 'completed',
    completed_at: null,
    sets_completed: 0,
    total_reps: null,
    total_volume: null,
    total_duration_seconds: null,
    top_set_weight: null,
    metadata: {},
    ...partial,
  }
}

function session(exercises: SessionExercise[]): WorkoutSession {
  return {
    id: 's',
    user_id: 'u',
    routine_id: 'r',
    status: 'completed',
    performed_at: '2026-09-10T10:00:00Z',
    started_at: null,
    ended_at: null,
    total_duration_seconds: null,
    active_duration_seconds: null,
    paused_duration_seconds: null,
    muscle_groups: [],
    notes: '',
    metadata: {},
    exercises,
  }
}

function setsFor(usage: { muscle_group: string; sets: number }[], group: string): number {
  return usage.find((u) => u.muscle_group === group)?.sets ?? 0
}

describe('sessionMuscleUsage', () => {
  it('credits sets to the primary and each secondary muscle group', () => {
    const usage = sessionMuscleUsage(
      session([exercise({ primary_muscle_group: 'chest', secondary_muscle_groups: ['triceps', 'shoulders'], sets_completed: 3 })]),
    )
    expect(setsFor(usage, 'chest')).toBe(3)
    expect(setsFor(usage, 'triceps')).toBe(3)
    expect(setsFor(usage, 'shoulders')).toBe(3)
  })

  it('sums sets for a group worked by multiple exercises', () => {
    const usage = sessionMuscleUsage(
      session([
        exercise({ primary_muscle_group: 'chest', sets_completed: 4 }),
        exercise({ primary_muscle_group: 'triceps', secondary_muscle_groups: ['chest'], sets_completed: 3 }),
      ]),
    )
    // chest: 4 (primary) + 3 (secondary of the second exercise) = 7
    expect(setsFor(usage, 'chest')).toBe(7)
    expect(setsFor(usage, 'triceps')).toBe(3)
  })

  it('omits groups with no completed sets', () => {
    const usage = sessionMuscleUsage(
      session([exercise({ primary_muscle_group: 'chest', secondary_muscle_groups: ['triceps'], sets_completed: 0 })]),
    )
    expect(usage).toEqual([])
  })

  it('returns an empty list for a session with no exercises', () => {
    expect(sessionMuscleUsage(session([]))).toEqual([])
  })
})
