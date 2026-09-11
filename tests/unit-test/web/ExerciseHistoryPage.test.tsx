import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { ExerciseHistoryPage } from '@/features/exercises/ExerciseHistoryPage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const HISTORY = {
  exercise: {
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
  sessions: [],
  trend: { metric: 'weight', direction: 'none', change: 0 },
}

const HISTORY_DETAIL = {
  exercise: {
    ...HISTORY.exercise,
    target_weight: 40,
    secondary_muscle_groups: ['triceps'],
    catalog_exercise_id: 'cat-1',
    catalog_name: 'Barbell Bench Press',
  },
  sessions: [
    {
      session_id: 's1',
      performed_at: '2026-09-02T09:00:00Z',
      top_set: { weight: 42.5, weight_unit: 'kg', reps: 8 },
      total_volume: 1020,
      sets: [{ set_number: 1, weight: 42.5, reps: 8 }],
    },
  ],
  trend: { metric: 'weight', direction: 'up', change: 5 },
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/exercises/e1/history']}>
        <AuthProvider>
          <Routes>
            <Route path="/exercises/:id/history" element={<ExerciseHistoryPage />} />
            <Route path="/routines/:id" element={<div>Routine detail</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ExerciseHistoryPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('defaults to the Info tab (muscles, target, source) and switches to Progress/History', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, HISTORY_DETAIL))
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    await screen.findAllByText('Bench Press')

    // Info tab is shown by default: muscle groups, measurement, target, source.
    expect(screen.getByText('Chest')).toBeInTheDocument()
    expect(screen.getByText('Triceps')).toBeInTheDocument()
    expect(screen.getByText('Weight × reps')).toBeInTheDocument()
    expect(screen.getByText('4×8 @ 40kg')).toBeInTheDocument()
    expect(screen.getByText('Catalog: Barbell Bench Press')).toBeInTheDocument()
    // The logged session (History) is not visible until that tab is selected.
    expect(screen.queryByText(/Volume/)).not.toBeInTheDocument()

    // Progress tab shows the progression trend.
    await userEvent.click(screen.getByRole('tab', { name: 'Progress' }))
    expect(screen.getByText(/Improving/)).toBeInTheDocument()
    expect(screen.getByText(/\+5 kg/)).toBeInTheDocument()

    // History tab shows the logged session's top set.
    await userEvent.click(screen.getByRole('tab', { name: 'History' }))
    expect(screen.getByText(/42\.5/)).toBeInTheDocument()
    expect(screen.getByText(/Volume 1,020/)).toBeInTheDocument()
  })

  it('edits the exercise with values pre-filled from the current exercise (PATCH round-trip)', async () => {
    const calls: { url: string; method: string; body: unknown }[] = []
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (method === 'PATCH') return jsonResponse(200, { ...HISTORY.exercise, target_reps: 10 })
      return jsonResponse(200, HISTORY)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    await screen.findAllByText('Bench Press')

    await userEvent.click(screen.getByRole('button', { name: /edit exercise/i }))
    // Pre-filled from the fetched exercise.
    expect(await screen.findByLabelText('Name')).toHaveValue('Bench Press')
    const reps = screen.getByLabelText('Reps')
    expect(reps).toHaveValue(8)

    await userEvent.clear(reps)
    await userEvent.type(reps, '10')
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      const patch = calls.find((c) => c.method === 'PATCH')
      expect(patch).toBeTruthy()
      expect(patch!.url).toContain('/api/v1/exercises/e1')
      expect(patch!.body).toMatchObject({ name: 'Bench Press', target_reps: 10 })
    })
  })

  it('deletes the exercise and navigates back to the parent routine', async () => {
    const calls: { url: string; method: string }[] = []
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ url: String(url), method })
      if (method === 'DELETE') return new Response(null, { status: 204 })
      return jsonResponse(200, HISTORY)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderPage()
    await screen.findAllByText('Bench Press')

    await userEvent.click(screen.getByRole('button', { name: /edit exercise/i }))
    await userEvent.click(await screen.findByRole('button', { name: /delete exercise/i }))

    await waitFor(() =>
      expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('/api/v1/exercises/e1'))).toBe(true),
    )
    expect(await screen.findByText('Routine detail')).toBeInTheDocument()
  })
})
