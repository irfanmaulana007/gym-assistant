import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '@/api/analytics'
import type { DashboardWindow } from '@/types/api'

// useDashboard fetches the composed analytics dashboard for a time window.
// Keyed by window so switching the selector refetches (and caches) per window.
export function useDashboard(window: DashboardWindow) {
  return useQuery({
    queryKey: ['dashboard', window],
    queryFn: () => analyticsApi.dashboard(window),
  })
}
