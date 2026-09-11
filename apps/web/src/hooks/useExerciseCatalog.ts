import { useQuery } from '@tanstack/react-query'
import { catalogApi, type CatalogListParams } from '@/api/catalog'

// useExerciseCatalog loads the shared exercise catalog (PRD 0006). The catalog
// is static master data, so it is cached generously; callers filter/search the
// returned list client-side for an instant, offline-friendly picker.
export function useExerciseCatalog(params: CatalogListParams = {}) {
  return useQuery({
    queryKey: ['exercise-catalog', params],
    queryFn: () => catalogApi.list(params),
    staleTime: 5 * 60_000,
  })
}
