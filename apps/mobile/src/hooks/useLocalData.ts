import { useQuery } from '@tanstack/react-query'
import { activeSession, getRoutine, getSession, getStore, listRoutines, listSessions } from '@/db'
import type { User } from '@/types/api'

// Thin React Query hooks reading the local store (the source of truth). They
// never hit the network; the sync worker reconciles the store and invalidates
// these queries (lib/sync.tsx). Keys are invalidated wholesale on every commit.

export function useRoutines() {
  return useQuery({ queryKey: ['routines'], queryFn: async () => listRoutines(getStore()) })
}

export function useRoutine(id: string) {
  return useQuery({ queryKey: ['routine', id], queryFn: async () => getRoutine(getStore(), id) ?? null })
}

export function useSessions() {
  return useQuery({ queryKey: ['sessions'], queryFn: async () => listSessions(getStore()) })
}

export function useSession(id: string) {
  return useQuery({ queryKey: ['session', id], queryFn: async () => getSession(getStore(), id) ?? null })
}

export function useActiveSession() {
  return useQuery({ queryKey: ['activeSession'], queryFn: async () => activeSession(getStore()) ?? null })
}

export function useCachedUser() {
  return useQuery({ queryKey: ['user'], queryFn: async () => getStore().meta.get<User>('user') ?? null })
}
