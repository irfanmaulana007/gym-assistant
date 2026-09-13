import { useQuery } from '@tanstack/react-query'
import { sessionsApi } from '@/api/sessions'
import { useAuth } from '@/lib/auth'
import type { WorkoutSession } from '@/types/api'

// Query key for the user's single in-progress session. Mutations that end a
// session (complete/abandon) or start one should invalidate this so the global
// resume banner appears/disappears without a reload.
export const ACTIVE_SESSION_KEY = ['active-session'] as const

// Finds the user's live session (status `active` or `paused`), if any. The API
// enforces one live session at a time and has no dedicated "current session"
// endpoint, so we derive it from the sessions list. Returns `null` when nothing
// is running.
export function useActiveSession() {
  const { token } = useAuth()
  return useQuery<WorkoutSession | null>({
    queryKey: ACTIVE_SESSION_KEY,
    enabled: !!token,
    queryFn: async () => {
      const sessions = await sessionsApi.list(20, 0)
      return (sessions ?? []).find((s) => s.status === 'active' || s.status === 'paused') ?? null
    },
  })
}
