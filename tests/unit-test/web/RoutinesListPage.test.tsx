import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { RoutinesListPage } from '@/features/routines/RoutinesListPage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AuthProvider>
          <RoutinesListPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RoutinesListPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('renders the list of routines', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { routines: [{ id: '1', name: 'Push Day', notes: '', position: 0 }] })),
    )
    renderPage()
    expect(await screen.findByText('Push Day')).toBeInTheDocument()
  })

  it('does not render a delete control on list rows (delete moved to detail page)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { routines: [{ id: '1', name: 'Push Day', notes: '', position: 0 }] })),
    )
    renderPage()
    await screen.findByText('Push Day')
    expect(screen.queryByRole('button', { name: /delete push day/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
  })

  it('creates a routine and refreshes the list', async () => {
    const calls: { url: string; method: string }[] = []
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      const method = init?.method ?? 'GET'
      calls.push({ url: u, method })
      if (method === 'POST') return jsonResponse(201, { id: '2', name: 'Pull Day', notes: '', position: 1 })
      // GET list: empty first, then contains the created one after invalidation.
      const created = calls.some((c) => c.method === 'POST')
      return jsonResponse(200, {
        routines: created ? [{ id: '2', name: 'Pull Day', notes: '', position: 1 }] : [],
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    await screen.findByText(/no workout days yet/i)

    // The create form now lives in a modal/bottom-sheet — open it first.
    await userEvent.click(screen.getByRole('button', { name: /new workout day/i }))
    await userEvent.type(await screen.findByLabelText('Workout day name'), 'Pull Day')
    await userEvent.click(screen.getByRole('button', { name: /add workout day/i }))

    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.includes('/api/v1/routines'))).toBe(true))
    expect(await screen.findByText('Pull Day')).toBeInTheDocument()
  })
})
