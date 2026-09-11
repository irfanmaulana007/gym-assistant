import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { queryClient } from '@/lib/queryClient'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { RoutinesListPage } from '@/features/routines/RoutinesListPage'
import { RoutineDetailPage } from '@/features/routines/RoutineDetailPage'
import { ActiveSessionPage } from '@/features/sessions/ActiveSessionPage'
import { ExerciseHistoryPage } from '@/features/exercises/ExerciseHistoryPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { DashboardPage } from '@/features/progress/DashboardPage'

function protectedElement(el: React.ReactNode) {
  return <ProtectedRoute>{el}</ProtectedRoute>
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/" element={protectedElement(<RoutinesListPage />)} />
            <Route path="/routines/:id" element={protectedElement(<RoutineDetailPage />)} />
            <Route path="/sessions/:id" element={protectedElement(<ActiveSessionPage />)} />
            <Route path="/exercises/:id/history" element={protectedElement(<ExerciseHistoryPage />)} />
            <Route path="/progress" element={protectedElement(<DashboardPage />)} />
            <Route path="/profile" element={protectedElement(<ProfilePage />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
