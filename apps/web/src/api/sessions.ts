import { request } from './client'
import type {
  DistanceUnit,
  MeasurementType,
  MuscleGroup,
  SessionExercise,
  SessionExerciseStatus,
  SetEntry,
  WeightUnit,
  WorkoutSession,
} from '@/types/api'

export interface AdHocExerciseInput {
  name: string
  measurement_type?: MeasurementType
  target_sets?: number | null
  target_reps?: number | null
  target_duration_seconds?: number | null
  target_distance?: number | null
  distance_unit?: DistanceUnit | null
  primary_muscle_group?: MuscleGroup
  // When set, the API links the ad-hoc exercise to a catalog entry (PRD 0017)
  // and resolves its name/muscle groups/measurement type from the catalog.
  catalog_exercise_id?: string
}

export interface EntryInput {
  weight?: number | null
  weight_unit?: WeightUnit | null
  reps?: number | null
  duration_seconds?: number | null
  distance?: number | null
  distance_unit?: DistanceUnit | null
  incline?: number | null
  avg_heart_rate?: number | null
  max_heart_rate?: number | null
  is_completed?: boolean
}

export const sessionsApi = {
  start(routineId: string) {
    return request<WorkoutSession>(`/api/v1/routines/${routineId}/sessions`, { method: 'POST' })
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
