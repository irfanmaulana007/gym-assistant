import { request } from './client'
import type { CatalogExercise, MuscleGroup } from '@/types/api'

// Ported verbatim from apps/web/src/api/catalog.ts. Reads the shared, read-only
// exercise catalog (PRD 0006).
export interface CatalogListParams {
  search?: string
  muscle_group?: MuscleGroup
}

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
