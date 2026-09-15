// Derive per-muscle-group set counts for a single workout session, feeding the
// body heatmap on the session summary (PRD 0012).
//
// Each exercise contributes its completed sets to its primary muscle group AND
// to each of its secondary groups — a muscle worked by an exercise gets credit
// for those sets. The heatmap colors relative to the busiest group, so this
// stays meaningful within one session.

import type { MuscleUsageStat } from './muscleDiagram'
import type { WorkoutSession } from '@/types/api'

export function sessionMuscleUsage(session: WorkoutSession): MuscleUsageStat[] {
  const byGroup = new Map<string, number>()
  const add = (group: string, sets: number) => {
    if (sets <= 0) return
    byGroup.set(group, (byGroup.get(group) ?? 0) + sets)
  }

  for (const ex of session.exercises ?? []) {
    const sets = ex.sets_completed ?? 0
    add(ex.primary_muscle_group, sets)
    for (const g of ex.secondary_muscle_groups ?? []) add(g, sets)
  }

  return [...byGroup.entries()].map(([muscle_group, sets]) => ({ muscle_group, sets }))
}
