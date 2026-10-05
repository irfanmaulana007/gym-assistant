import { request } from './client'
import type { Dashboard, DashboardWindow, MuscleGroupsResult } from '@/types/api'

// Resolve the device's IANA timezone so "this week", day bucketing, and the
// activity calendar align to the user's local days (PRD 0018 §4.4 — "send the
// device IANA timezone"). Falls back to UTC (the server default) when the
// runtime doesn't expose it (some Hermes builds ship a limited Intl).
function localTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

// analyticsApi reads the auth-scoped, read-only analytics dashboard (PRD 0007).
// Offline, screens render the last successful fetch cached in the local DB
// (PRD 0018 non-goal: analytics is read-only cache, not recomputed on-device).
export const analyticsApi = {
  dashboard(window: DashboardWindow = 'month') {
    const qs = new URLSearchParams({ window, tz: localTz() })
    return request<Dashboard>(`/api/v1/analytics/dashboard?${qs.toString()}`)
  },

  muscleGroups(window: DashboardWindow = 'month') {
    const qs = new URLSearchParams({ window, tz: localTz() })
    return request<MuscleGroupsResult>(`/api/v1/analytics/muscle-groups?${qs.toString()}`)
  },
}
