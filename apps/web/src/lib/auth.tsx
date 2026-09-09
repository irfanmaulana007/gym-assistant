import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getToken, setToken, setUnauthorizedHandler } from '@/api/client'
import { authApi } from '@/api/auth'
import type { User } from '@/types/api'

interface AuthState {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken())
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState<boolean>(!!getToken())

  const logout = useCallback(() => {
    setToken(null)
    setTokenState(null)
    setUser(null)
  }, [])

  // Any 401 from the API logs the user out centrally.
  useEffect(() => {
    setUnauthorizedHandler(logout)
  }, [logout])

  // On first load with a stored token, hydrate the current user.
  useEffect(() => {
    let cancelled = false
    if (!token) {
      setLoading(false)
      return
    }
    setLoading(true)
    authApi
      .me()
      .then((u) => {
        if (!cancelled) setUser(u)
      })
      .catch(() => {
        if (!cancelled) logout()
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, logout])

  const applyAuth = useCallback((newToken: string, u: User) => {
    setToken(newToken)
    setTokenState(newToken)
    setUser(u)
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login(email, password)
      applyAuth(res.token, res.user)
    },
    [applyAuth],
  )

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const res = await authApi.register(email, password, displayName)
      applyAuth(res.token, res.user)
    },
    [applyAuth],
  )

  const value = useMemo<AuthState>(
    () => ({ user, token, loading, login, register, logout }),
    [user, token, loading, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
