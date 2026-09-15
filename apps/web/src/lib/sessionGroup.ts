import type { Routine, WorkoutSession } from '@/types/api'

// The "workout group" a session belongs to — the routine it was run from
// (Push / Pull / Legs / Upper / Lower …). Sessions store only `routine_id`, so
// we resolve the current name from the routines the user still has. Ad-hoc
// sessions (no routine) or sessions whose routine was since deleted fall back
// to a neutral label so the row still reads sensibly.
export function sessionGroupLabel(
  session: Pick<WorkoutSession, 'routine_id'>,
  routinesById: Map<string, Pick<Routine, 'name'>>,
): string {
  const name = session.routine_id ? routinesById.get(session.routine_id)?.name?.trim() : undefined
  return name || 'Workout'
}

export function routinesById(routines: Pick<Routine, 'id' | 'name'>[] | undefined): Map<string, { name: string }> {
  const map = new Map<string, { name: string }>()
  for (const r of routines ?? []) map.set(r.id, { name: r.name })
  return map
}
