import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '@/api/analytics'
import type { DashboardWindow } from '@/types/api'

// useMuscleGroups fetches the per-muscle-group training breakdown for a time
// window (PRD 0011), backing the profile muscle-usage diagram. Keyed by window
// so switching the selector refetches and caches per window.
export function useMuscleGroups(window: DashboardWindow) {
  return useQuery({
    queryKey: ['muscle-groups', window],
    queryFn: () => analyticsApi.muscleGroups(window),
  })
}
