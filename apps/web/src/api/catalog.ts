import { request } from './client'
import type { CatalogExercise, MuscleGroup } from '@/types/api'

export interface CatalogListParams {
  search?: string
  muscle_group?: MuscleGroup
}

// catalogApi reads the shared, read-only exercise catalog (PRD 0006). The list
// endpoint wraps results under `exercises`, matching the routines/sessions
// list convention.
export const catalogApi = {
  list(params: CatalogListParams = {}) {
    const qs = new URLSearchParams()
    if (params.search) qs.set('search', params.search)
    if (params.muscle_group) qs.set('muscle_group', params.muscle_group)
    const query = qs.toString()
    const path = query ? `/api/v1/exercise-catalog?${query}` : '/api/v1/exercise-catalog'
    return request<{ exercises: CatalogExercise[] }>(path).then((r) => r.exercises)
  },
}
