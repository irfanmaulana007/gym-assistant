import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { Spinner } from './ui'

// Gates authenticated routes: while hydrating the session it shows a spinner;
// with no user it redirects to login.
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner label="Loading your account…" />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}
