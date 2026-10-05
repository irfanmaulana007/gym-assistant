import { request } from './client'
import type {
  MeasurementType,
  MuscleGroup,
  SessionExercise,
  SessionExerciseStatus,
  SetEntry,
  WeightUnit,
  WorkoutSession,
} from '@/types/api'

// Ported verbatim from apps/web/src/api/sessions.ts, with optional client-
// supplied ids on creates so offline replays are idempotent (PRD 0018 §4.5).
export interface AdHocExerciseInput {
  name: string
  measurement_type?: MeasurementType
  target_sets?: number | null
  target_reps?: number | null
  target_duration_seconds?: number | null
  primary_muscle_group?: MuscleGroup
  // Links the ad-hoc exercise to a catalog entry (PRD 0017).
  catalog_exercise_id?: string
  id?: string
}

export interface EntryInput {
  weight?: number | null
  weight_unit?: WeightUnit | null
  reps?: number | null
  duration_seconds?: number | null
  is_completed?: boolean
  id?: string
}

/** Client-id'd snapshot of a session exercise, sent with an offline-started
 * session so the replayed start reproduces the exact local rows (PRD 0018 §6
 * Q1 companion idempotency API). */
export interface SessionExerciseSnapshot {
  id: string
  exercise_id: string | null
  position: number
  name_snapshot: string
  measurement_type: MeasurementType
  target_sets: number | null
  target_reps: number | null
  target_duration_seconds: number | null
  primary_muscle_group: MuscleGroup
  secondary_muscle_groups: MuscleGroup[]
}

export const sessionsApi = {
  start(routineId: string, id?: string, exercises?: SessionExerciseSnapshot[]) {
    const body: Record<string, unknown> = {}
    if (id) body.id = id
    if (exercises) body.exercises = exercises
    return request<WorkoutSession>(`/api/v1/routines/${routineId}/sessions`, {
      method: 'POST',
      ...(Object.keys(body).length ? { body } : {}),
    })
  },
  get(id: string) {
    return request<WorkoutSession>(`/api/v1/sessions/${id}`)
  },
  list(limit = 20, offset = 0) {
    return request<{ sessions: WorkoutSession[] }>(`/api/v1/sessions?limit=${limit}&offset=${offset}`).then(
      (r) => r.sessions,
    )
  },
  pause(id: string) {
    return request<WorkoutSession>(`/api/v1/sessions/${id}/pause`, { method: 'POST' })
  },
  resume(id: string) {
    return request<WorkoutSession>(`/api/v1/sessions/${id}/resume`, { method: 'POST' })
  },
  complete(id: string) {
    return request<WorkoutSession>(`/api/v1/sessions/${id}/complete`, { method: 'POST' })
  },
  abandon(id: string) {
    return request<WorkoutSession>(`/api/v1/sessions/${id}/abandon`, { method: 'POST' })
  },
  updateSessionExercise(id: string, patch: { status?: SessionExerciseStatus; position?: number }) {
    return request<SessionExercise>(`/api/v1/session-exercises/${id}`, { method: 'PATCH', body: patch })
  },
  addExercise(sessionId: string, input: AdHocExerciseInput) {
    return request<SessionExercise>(`/api/v1/sessions/${sessionId}/exercises`, { method: 'POST', body: input })
  },
  removeSessionExercise(id: string) {
    return request<void>(`/api/v1/session-exercises/${id}`, { method: 'DELETE' })
  },
  addEntry(sessionExerciseId: string, input: EntryInput) {
    return request<SetEntry>(`/api/v1/session-exercises/${sessionExerciseId}/entries`, { method: 'POST', body: input })
  },
  updateEntry(id: string, input: EntryInput) {
    return request<SetEntry>(`/api/v1/entries/${id}`, { method: 'PATCH', body: input })
  },
  removeEntry(id: string) {
    return request<void>(`/api/v1/entries/${id}`, { method: 'DELETE' })
  },
}
