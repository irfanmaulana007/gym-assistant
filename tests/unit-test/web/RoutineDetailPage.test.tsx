import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { RoutineDetailPage } from '@/features/routines/RoutineDetailPage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const ROUTINE = {
  id: 'r1',
  user_id: 'u1',
  name: 'Push Day',
  notes: '',
  position: 0,
  created_at: '',
  updated_at: '',
  exercises: [
    {
      id: 'e1',
      routine_id: 'r1',
      name: 'Bench Press',
      measurement_type: 'weight_reps',
      target_sets: 4,
      target_reps: 8,
      target_weight: null,
      target_duration_seconds: null,
      target_distance: null,
      distance_unit: null,
      primary_muscle_group: 'chest',
      secondary_muscle_groups: [],
      default_metadata: {},
      notes: '',
      position: 0,
      created_at: '',
      updated_at: '',
    },
  ],
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/routines/r1']}>
        <AuthProvider>
          <Routes>
            <Route path="/routines/:id" element={<RoutineDetailPage />} />
            <Route path="/" element={<div>Workouts home</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RoutineDetailPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('does not render a delete control on exercise rows', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, ROUTINE)))
    renderPage()
    await screen.findByText('Bench Press')
    expect(screen.queryByRole('button', { name: /delete bench press/i })).not.toBeInTheDocument()
  })

  it('edits the routine name via the detail page (PATCH round-trip)', async () => {
    const calls: { url: string; method: string; body: unknown }[] = []
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (method === 'PATCH') return jsonResponse(200, { ...ROUTINE, name: 'Chest Day' })
      const updated = calls.some((c) => c.method === 'PATCH')
      return jsonResponse(200, { ...ROUTINE, name: updated ? 'Chest Day' : 'Push Day' })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    await screen.findByText('Bench Press')

    await userEvent.click(screen.getByRole('button', { name: /edit workout day/i }))
    const nameInput = await screen.findByLabelText('Workout day name')
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Chest Day')
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      const patch = calls.find((c) => c.method === 'PATCH')
      expect(patch).toBeTruthy()
      expect(patch!.url).toContain('/api/v1/routines/r1')
      expect(patch!.body).toMatchObject({ name: 'Chest Day' })
    })
  })

  it('deletes the routine from the detail page and navigates home', async () => {
    const calls: { url: string; method: string }[] = []
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ url: String(url), method })
      if (method === 'DELETE') return new Response(null, { status: 204 })
      return jsonResponse(200, ROUTINE)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderPage()
    await screen.findByText('Bench Press')

    await userEvent.click(screen.getByRole('button', { name: /edit workout day/i }))
    await userEvent.click(await screen.findByRole('button', { name: /delete workout day/i }))

    await waitFor(() =>
      expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('/api/v1/routines/r1'))).toBe(true),
    )
    expect(await screen.findByText('Workouts home')).toBeInTheDocument()
  })
})
