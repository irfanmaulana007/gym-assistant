// Derive per-muscle-group set counts for a single workout session, feeding the
// body heatmap on the session summary (PRD 0013).
//
// Each exercise contributes its completed sets to its primary muscle group AND
// to each of its secondary groups — a muscle worked by an exercise gets credit
// for those sets. The heatmap colors relative to the busiest group, so this
// stays meaningful within one session.

import type { MuscleUsageStat } from './muscleDiagram'
import type { SessionExercise, WorkoutSession } from '@/types/api'

// Cardio is timed work, not lifting — it shouldn't color the strength heatmap.
// The `cardio` primary group is the same signal the analytics landmark and the
// dashboard's cardio row use (PRD 0015).
export function isCardioExercise(ex: Pick<SessionExercise, 'primary_muscle_group'>): boolean {
  return ex.primary_muscle_group === 'cardio'
}

export function sessionMuscleUsage(
  session: WorkoutSession,
  opts?: { includeCardio?: boolean },
): MuscleUsageStat[] {
  const includeCardio = opts?.includeCardio ?? true
  const byGroup = new Map<string, number>()
  const add = (group: string, sets: number) => {
    if (sets <= 0) return
    byGroup.set(group, (byGroup.get(group) ?? 0) + sets)
  }

  for (const ex of session.exercises ?? []) {
    // Skipping the whole exercise drops both its primary and secondary credit,
    // so a cardio bout can't color real muscles when cardio is excluded.
    if (!includeCardio && isCardioExercise(ex)) continue
    const sets = ex.sets_completed ?? 0
    add(ex.primary_muscle_group, sets)
    for (const g of ex.secondary_muscle_groups ?? []) add(g, sets)
  }

  return [...byGroup.entries()].map(([muscle_group, sets]) => ({ muscle_group, sets }))
}
