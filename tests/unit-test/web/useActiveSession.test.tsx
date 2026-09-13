import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { useActiveSession } from '@/hooks/useActiveSession'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function makeSession(id: string, status: string) {
  return {
    id,
    user_id: 'u1',
    routine_id: 'r1',
    status,
    performed_at: '2026-09-12T04:57:37Z',
    started_at: '2026-09-12T04:57:37Z',
    ended_at: null,
    total_duration_seconds: null,
    active_duration_seconds: null,
    paused_duration_seconds: null,
    muscle_groups: [],
    notes: '',
    metadata: {},
  }
}

// Routes fetch by URL: /auth/me hydrates AuthProvider, /sessions returns the list.
function stubFetch(sessions: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('/api/v1/auth/me')) return jsonResponse(200, { id: 'u1', email: 'a@b.c', display_name: 'A' })
      if (u.includes('/api/v1/sessions')) return jsonResponse(200, { sessions })
      return jsonResponse(404, { error: { code: 'not_found', message: 'nope' } })
    }),
  )
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
}

describe('useActiveSession', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('returns the active session among the list', async () => {
    localStorage.setItem('gym.token', 'tok')
    stubFetch([makeSession('done', 'completed'), makeSession('live', 'active')])
    const { result } = renderHook(() => useActiveSession(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(result.current.data?.id).toBe('live')
  })

  it('returns a paused session too', async () => {
    localStorage.setItem('gym.token', 'tok')
    stubFetch([makeSession('p', 'paused')])
    const { result } = renderHook(() => useActiveSession(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(result.current.data?.status).toBe('paused')
  })

  it('returns null when nothing is running', async () => {
    localStorage.setItem('gym.token', 'tok')
    stubFetch([makeSession('a', 'completed'), makeSession('b', 'abandoned')])
    const { result } = renderHook(() => useActiveSession(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })
})
