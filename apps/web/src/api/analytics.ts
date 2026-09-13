import { request } from './client'
import type { Dashboard, DashboardWindow, MuscleGroupsResult } from '@/types/api'

// Resolve the browser's IANA timezone so "this week", day bucketing, and the
// activity calendar align to the user's local days (PRD §5.1). Falls back to
// UTC (the server default) when the environment doesn't expose it.
function localTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

// analyticsApi reads the auth-scoped, read-only analytics dashboard (PRD 0007).
// The composed /dashboard endpoint backs first paint in a single round-trip.
export const analyticsApi = {
  dashboard(window: DashboardWindow = 'month') {
    const qs = new URLSearchParams({ window, tz: localTz() })
    return request<Dashboard>(`/api/v1/analytics/dashboard?${qs.toString()}`)
  },

  // Focused per-muscle-group breakdown — backs the profile muscle-usage diagram
  // (PRD 0011) without pulling the whole dashboard payload.
  muscleGroups(window: DashboardWindow = 'month') {
    const qs = new URLSearchParams({ window, tz: localTz() })
    return request<MuscleGroupsResult>(`/api/v1/analytics/muscle-groups?${qs.toString()}`)
  },
}
