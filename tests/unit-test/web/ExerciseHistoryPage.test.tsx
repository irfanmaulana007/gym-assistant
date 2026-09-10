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
