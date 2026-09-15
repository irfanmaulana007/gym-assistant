import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { SessionHistoryPage } from '@/features/sessions/SessionHistoryPage'

// PRD 0013 — the History tab lists completed sessions, most-recent first, each
// linking to the same summary shown right after finishing.

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function sessionRow(partial: Record<string, unknown>) {
  return {
    id: 'id',
    user_id: 'u',
    routine_id: 'r',
    status: 'completed',
    performed_at: '2026-09-10T10:00:00Z',
    started_at: null,
    ended_at: null,
    total_duration_seconds: 3600,
    active_duration_seconds: 2700,
    paused_duration_seconds: 0,
    muscle_groups: ['chest', 'triceps'],
    notes: '',
    metadata: {},
    ...partial,
  }
}

function renderWith(sessions: unknown[], routines: unknown[] = [{ id: 'r', name: 'Push Day' }]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('/routines')) return jsonResponse(200, { routines })
      return jsonResponse(200, { sessions })
    }) as unknown as typeof fetch,
  )
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/sessions']}>
        <AuthProvider>
          <SessionHistoryPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SessionHistoryPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  // The page renders inside the app shell, so the bottom-nav links are present
  // too — scope assertions to the session rows via their /sessions/:id hrefs.
  function sessionLinks(container: HTMLElement): HTMLAnchorElement[] {
    return [...container.querySelectorAll<HTMLAnchorElement>('a[href^="/sessions/"]')]
  }

  it('lists completed sessions with a link to the summary', async () => {
    const { container } = renderWith([sessionRow({ id: 's1', performed_at: '2026-09-10T10:00:00Z' })])
    await waitFor(() => expect(sessionLinks(container)).toHaveLength(1))
    expect(sessionLinks(container)[0]).toHaveAttribute('href', '/sessions/s1')
    expect(screen.getByText('Chest')).toBeInTheDocument()
    expect(screen.getByText('Triceps')).toBeInTheDocument()
  })

  it('titles each row with the workout group (routine) name', async () => {
    const { container } = renderWith(
      [sessionRow({ id: 's1', routine_id: 'push' })],
      [{ id: 'push', name: 'Push Day' }],
    )
    await waitFor(() => expect(sessionLinks(container)).toHaveLength(1))
    expect(screen.getByText('Push Day')).toBeInTheDocument()
  })

  it('falls back to "Workout" when the session has no routine', async () => {
    const { container } = renderWith([sessionRow({ id: 's1', routine_id: null })], [])
    await waitFor(() => expect(sessionLinks(container)).toHaveLength(1))
    // Scope to the row — "Workout" is also the bottom-nav tab label.
    expect(within(sessionLinks(container)[0]).getByText('Workout')).toBeInTheDocument()
  })

  it('filters out non-completed sessions and sorts most-recent first', async () => {
    const { container } = renderWith([
      sessionRow({ id: 'older', performed_at: '2026-09-01T10:00:00Z' }),
      sessionRow({ id: 'newer', performed_at: '2026-09-20T10:00:00Z' }),
      sessionRow({ id: 'abandoned', status: 'abandoned', performed_at: '2026-09-25T10:00:00Z' }),
    ])
    await waitFor(() => expect(sessionLinks(container)).toHaveLength(2))
    const links = sessionLinks(container)
    expect(links[0]).toHaveAttribute('href', '/sessions/newer')
    expect(links[1]).toHaveAttribute('href', '/sessions/older')
  })

  it('shows an empty state when there are no completed sessions', async () => {
    const { container } = renderWith([sessionRow({ id: 'a', status: 'abandoned' })])
    expect(await screen.findByText(/no workouts yet/i)).toBeInTheDocument()
    expect(sessionLinks(container)).toHaveLength(0)
  })
})
