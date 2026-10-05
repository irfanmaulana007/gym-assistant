import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  getRefreshToken,
  getToken,
  setRefreshToken,
  setToken,
  setUnauthorizedHandler,
} from '@/api/client'
import { authApi } from '@/api/auth'
import { getStore } from '@/db'
import type { LocalStore } from '@/db/store'
import type { User } from '@/types/api'
import { useSync } from './sync'

// RN auth context, ported from apps/web/src/lib/auth.tsx. Differences:
//   - tokens live in the Keychain-backed store (already hydrated at launch), not
//     localStorage;
//   - the current user is cached in the local store (meta 'user') so the app
//     opens straight to the user's data offline, with `GET /auth/me` refreshing
//     it when connectivity allows;
//   - login/register trigger an initial pull so the local store fills.
interface AuthState {
  user: User | null
  token: string | null
  loading: boolean
  login: (identifier: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName: string, username?: string) => Promise<void>
  logout: () => void
  setUser: (user: User) => void
}

const AuthContext = createContext<AuthState | undefined>(undefined)

// On logout, clear this account's data so nothing leaks into the next sign-in
// (single-user device). The next login pulls the account fresh.
function wipeLocalData(store: LocalStore): void {
  store.transaction(() => {
    store.routines.clear()
    store.exercises.clear()
    store.sessions.clear()
    store.sessionExercises.clear()
    store.entries.clear()
    store.outbox.clear()
    store.meta.delete('user')
    store.meta.delete('last_synced_at')
  })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const store = getStore()
  const { syncNow } = useSync()
  const [token, setTokenState] = useState<string | null>(() => getToken())
  const [user, setUserState] = useState<User | null>(() => store.meta.get<User>('user') ?? null)
  const [loading, setLoading] = useState<boolean>(!!getToken() && !store.meta.get<User>('user'))

  const setUser = useCallback(
    (u: User) => {
      store.meta.set('user', u)
      setUserState(u)
    },
    [store],
  )

  const logout = useCallback(() => {
    const refreshToken = getRefreshToken()
    if (refreshToken) void authApi.logout(refreshToken).catch(() => {})
    setToken(null)
    setRefreshToken(null)
    setTokenState(null)
    setUserState(null)
    wipeLocalData(store)
  }, [store])

  useEffect(() => {
    setUnauthorizedHandler(logout)
  }, [logout])

  // On launch with a stored token, refresh the user from the server when online;
  // offline we keep the cached user and simply stop the spinner.
  useEffect(() => {
    let cancelled = false
    if (!token) {
      setLoading(false)
      return
    }
    authApi
      .me()
      .then((u) => {
        if (!cancelled) setUser(u)
      })
      .catch(() => {
        // Offline or transient — fall back to the cached user if we have one.
        if (!cancelled && !store.meta.get<User>('user')) logout()
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, logout, setUser, store])

  const applyAuth = useCallback(
    (newToken: string, refreshToken: string, u: User) => {
      setToken(newToken)
      setRefreshToken(refreshToken)
      setTokenState(newToken)
      setUser(u)
      void syncNow() // pull the account's data into the local store
    },
    [setUser, syncNow],
  )

  const login = useCallback(
    async (identifier: string, password: string) => {
      const res = await authApi.login(identifier, password)
      applyAuth(res.token, res.refresh_token, res.user)
    },
    [applyAuth],
  )

  const register = useCallback(
    async (email: string, password: string, displayName: string, username?: string) => {
      const res = await authApi.register(email, password, displayName, username)
      applyAuth(res.token, res.refresh_token, res.user)
    },
    [applyAuth],
  )

  const value = useMemo<AuthState>(
    () => ({ user, token, loading, login, register, logout, setUser }),
    [user, token, loading, login, register, logout, setUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
