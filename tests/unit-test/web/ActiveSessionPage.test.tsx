import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { ActiveSessionPage } from '@/features/sessions/ActiveSessionPage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const SESSION_ID = 's1'

function activeSession(status = 'active') {
  return {
    id: SESSION_ID,
    user_id: 'u1',
    routine_id: 'r1',
    status,
    performed_at: '2026-09-10T10:00:00Z',
    started_at: '2026-09-10T10:00:00Z',
    ended_at: null,
    total_duration_seconds: null,
    active_duration_seconds: null,
    paused_duration_seconds: null,
    muscle_groups: [],
    notes: '',
    metadata: {},
    exercises: [],
  }
}

function renderPage(fetchMock: typeof fetch) {
  vi.stubGlobal('fetch', fetchMock)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/sessions/${SESSION_ID}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/sessions/:id" element={<ActiveSessionPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ActiveSessionPage — Stop confirmation sheet', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('opens the Save/Discard sheet on Stop instead of a native confirm', async () => {
    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    renderPage(vi.fn(async () => jsonResponse(200, activeSession())) as unknown as typeof fetch)

    await userEvent.click(await screen.findByRole('button', { name: /stop/i }))

    // The deliberate choice prevents an accidental tap from ending the workout.
    expect(await screen.findByRole('button', { name: /save workout/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /discard workout/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /keep going/i })).toBeInTheDocument()
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('Save workout completes the session', async () => {
    const calls: { url: string; method: string }[] = []
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      const method = init?.method ?? 'GET'
      calls.push({ url: u, method })
      if (method === 'POST' && u.includes('/complete')) return jsonResponse(200, activeSession('completed'))
      return jsonResponse(200, activeSession(calls.some((c) => c.url.includes('/complete')) ? 'completed' : 'active'))
    }) as unknown as typeof fetch
    renderPage(fetchMock)

    await userEvent.click(await screen.findByRole('button', { name: /stop/i }))
    await userEvent.click(await screen.findByRole('button', { name: /save workout/i }))

    await waitFor(() =>
      expect(
        calls.some((c) => c.method === 'POST' && c.url.includes(`/api/v1/sessions/${SESSION_ID}/complete`)),
      ).toBe(true),
    )
    expect(calls.some((c) => c.url.includes('/abandon'))).toBe(false)
  })

  it('Discard workout abandons the session', async () => {
    const calls: { url: string; method: string }[] = []
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      const method = init?.method ?? 'GET'
      calls.push({ url: u, method })
      if (method === 'POST' && u.includes('/abandon')) return jsonResponse(200, activeSession('abandoned'))
      return jsonResponse(200, activeSession(calls.some((c) => c.url.includes('/abandon')) ? 'abandoned' : 'active'))
    }) as unknown as typeof fetch
    renderPage(fetchMock)

    await userEvent.click(await screen.findByRole('button', { name: /stop/i }))
    await userEvent.click(await screen.findByRole('button', { name: /discard workout/i }))

    await waitFor(() =>
      expect(
        calls.some((c) => c.method === 'POST' && c.url.includes(`/api/v1/sessions/${SESSION_ID}/abandon`)),
      ).toBe(true),
    )
    expect(calls.some((c) => c.url.includes('/complete'))).toBe(false)
  })

  it('Keep going closes the sheet without calling either endpoint', async () => {
    const calls: { url: string; method: string }[] = []
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET' })
      return jsonResponse(200, activeSession())
    }) as unknown as typeof fetch
    renderPage(fetchMock)

    await userEvent.click(await screen.findByRole('button', { name: /stop/i }))
    await userEvent.click(await screen.findByRole('button', { name: /keep going/i }))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /save workout/i })).not.toBeInTheDocument(),
    )
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })
})
