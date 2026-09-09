import { request } from './client'
import type { Exercise, ExerciseHistory, MeasurementType, MuscleGroup, Routine } from '@/types/api'

export interface ExerciseInput {
  name: string
  measurement_type?: MeasurementType
  target_sets?: number | null
  target_reps?: number | null
  target_weight?: number | null
  target_duration_seconds?: number | null
  primary_muscle_group?: MuscleGroup
  secondary_muscle_groups?: MuscleGroup[]
  notes?: string
}

export const routinesApi = {
  list() {
    return request<{ routines: Routine[] }>('/api/v1/routines').then((r) => r.routines)
  },
  get(id: string) {
    return request<Routine>(`/api/v1/routines/${id}`)
  },
  create(name: string, notes = '') {
    return request<Routine>('/api/v1/routines', { method: 'POST', body: { name, notes } })
  },
  update(id: string, patch: Partial<Pick<Routine, 'name' | 'notes' | 'position'>>) {
    return request<Routine>(`/api/v1/routines/${id}`, { method: 'PATCH', body: patch })
  },
  remove(id: string) {
    return request<void>(`/api/v1/routines/${id}`, { method: 'DELETE' })
  },
  reorder(ids: string[]) {
    return request<{ routines: Routine[] }>('/api/v1/routines/reorder', { method: 'PATCH', body: { ids } }).then(
      (r) => r.routines,
    )
  },
}

export const exercisesApi = {
  create(routineId: string, input: ExerciseInput) {
    return request<Exercise>(`/api/v1/routines/${routineId}/exercises`, { method: 'POST', body: input })
  },
  update(id: string, patch: Partial<ExerciseInput>) {
    return request<Exercise>(`/api/v1/exercises/${id}`, { method: 'PATCH', body: patch })
  },
  remove(id: string) {
    return request<void>(`/api/v1/exercises/${id}`, { method: 'DELETE' })
  },
  reorder(routineId: string, ids: string[]) {
    return request<void>(`/api/v1/routines/${routineId}/exercises/reorder`, { method: 'PATCH', body: { ids } })
  },
  history(id: string) {
    return request<ExerciseHistory>(`/api/v1/exercises/${id}/history`)
  },
}
