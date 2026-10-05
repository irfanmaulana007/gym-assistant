// Offline-first exercise history. The web screen reads GET /exercises/:id/history
// (server-computed). Here we derive the same shape from the LOCAL store so the
// exercise detail works with no connection; when online the sync worker keeps
// the underlying sessions/entries fresh. Mirrors the ExerciseHistory contract
// (apps/web/src/types/api.ts) closely enough for the Info/Progress/History tabs.

import type { LocalStore } from '@/db/store'
import type { Exercise, Trend } from '@/types/api'

export interface LocalHistorySession {
  session_id: string
  performed_at: string
  top_set: { weight: number; weight_unit: string; reps: number } | null
  total_volume: number
  sets: { set_number: number; weight: number | null; reps: number | null }[]
}

export interface LocalExerciseHistory {
  exercise: Exercise | undefined
  sessions: LocalHistorySession[]
  trend: Trend
}

// Epley estimated 1RM — the comparable metric for progression.
function est1RM(weight: number, reps: number): number {
  return weight * (1 + reps / 30)
}

export function deriveExerciseHistory(store: LocalStore, exerciseId: string): LocalExerciseHistory {
  const exercise = store.exercises.get(exerciseId)

  // Map session id → performed_at for ordering.
  const sessionsById = new Map(store.sessions.all().map((s) => [s.id, s]))

  const built: LocalHistorySession[] = []
  for (const se of store.sessionExercises.all()) {
    if (se.exercise_id !== exerciseId) continue
    const session = sessionsById.get(se.session_id)
    if (!session || (session.status !== 'completed' && session.status !== 'active' && session.status !== 'paused')) {
      // include live sessions too so in-progress logging shows; skip abandoned
    }
    if (!session || session.status === 'abandoned') continue

    const entries = store.entries
      .all()
      .filter((e) => e.session_exercise_id === se.id && e.is_completed)
      .sort((a, b) => a.entry_number - b.entry_number)
    if (entries.length === 0) continue

    let top: { weight: number; weight_unit: string; reps: number } | null = null
    let volume = 0
    const sets = entries.map((e) => {
      if (e.weight != null && e.reps != null) volume += e.weight * e.reps
      if (e.weight != null && e.reps != null && (!top || e.weight > top.weight)) {
        top = { weight: e.weight, weight_unit: e.weight_unit ?? 'kg', reps: e.reps }
      }
      return { set_number: e.entry_number, weight: e.weight, reps: e.reps }
    })

    built.push({
      session_id: se.session_id,
      performed_at: session.performed_at,
      top_set: top,
      total_volume: volume,
      sets,
    })
  }

  // Oldest → newest (the screen reverses for display, matching web).
  built.sort((a, b) => Date.parse(a.performed_at) - Date.parse(b.performed_at))

  return { exercise, sessions: built, trend: computeTrend(built) }
}

function computeTrend(sessions: LocalHistorySession[]): Trend {
  const withTop = sessions.filter((s) => s.top_set)
  if (withTop.length < 2) return { metric: 'est_1rm', direction: 'none', change: 0 }
  const last = withTop[withTop.length - 1].top_set!
  const prev = withTop[withTop.length - 2].top_set!
  const delta = Math.round((est1RM(last.weight, last.reps) - est1RM(prev.weight, prev.reps)) * 10) / 10
  const change = Math.round((last.weight - prev.weight) * 10) / 10
  const direction = delta > 0.1 ? 'up' : delta < -0.1 ? 'down' : 'flat'
  return { metric: 'est_1rm', direction, change }
}
