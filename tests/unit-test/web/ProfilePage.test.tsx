import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { ProfilePage } from '@/features/profile/ProfilePage'

// The Profile screen replaces the old header dropdown: it surfaces the
// signed-in identity and hosts the logout action (see native-mobile-ux rule).

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const USER = {
  id: '1',
  email: 'jane@example.com',
  display_name: 'Jane Doe',
  created_at: '2026-01-15T10:00:00Z',
}

// Route fetch by URL: the Profile screen loads both the current user and the
// muscle-usage breakdown (PRD 0010). Everything else falls back to the user.
function stubFetch(muscleGroups: unknown[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/analytics/muscle-groups')) {
        return jsonResponse(200, { window: { key: 'month', from: '', to: '', bucket: 'week' }, volume_unit: 'kg', muscle_groups: muscleGroups })
      }
      return jsonResponse(200, USER)
    }),
  )
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/profile']}>
        <AuthProvider>
          <ProfilePage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProfilePage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('shows the signed-in identity and account details', async () => {
    localStorage.setItem('gym.token', 'jwt-token')
    stubFetch()

    renderPage()

    expect(await screen.findByText('Jane Doe')).toBeInTheDocument()
    // Email shows both as the header subtitle and in the account detail row.
    expect(screen.getAllByText('jane@example.com').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument()
    // The "Muscles trained" section (PRD 0010) renders with its window control.
    expect(screen.getByText('Muscles trained')).toBeInTheDocument()
    expect(await screen.findByText('No muscles trained in this window yet.')).toBeInTheDocument()
  })

  it('logs the user out and clears the stored token', async () => {
    localStorage.setItem('gym.token', 'jwt-token')
    stubFetch()

    renderPage()

    const logout = await screen.findByRole('button', { name: /logout/i })
    await userEvent.click(logout)

    await waitFor(() => expect(localStorage.getItem('gym.token')).toBeNull())
    // With no user, the screen renders nothing (ProtectedRoute redirects in-app).
    expect(screen.queryByText('jane@example.com')).not.toBeInTheDocument()
  })
})
