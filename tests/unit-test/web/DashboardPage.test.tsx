import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { DashboardPage } from '@/features/progress/DashboardPage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const EMPTY_DASHBOARD = {
  window: { key: 'month', from: '2026-09-01T00:00:00Z', to: '2026-10-01T00:00:00Z', bucket: 'week' },
  volume_unit: 'kg',
  summary: {
    workouts: { value: 0, previous: 0, delta_pct: null },
    training_minutes: { value: 0, previous: 0, delta_pct: null },
    total_volume: { value: 0, previous: 0, delta_pct: null },
    current_streak: 0,
    longest_streak: 0,
    days_since_last: null,
  },
  volume_series: [],
  muscle_groups: [],
  trending_up: [],
  stalled: [],
  records: [],
  calendar: [],
}

const FULL_DASHBOARD = {
  window: { key: 'month', from: '2026-09-01T00:00:00Z', to: '2026-10-01T00:00:00Z', bucket: 'week' },
  volume_unit: 'kg',
  summary: {
    workouts: { value: 8, previous: 6, delta_pct: 33.33 },
    training_minutes: { value: 320, previous: 280, delta_pct: 14.29 },
    total_volume: { value: 12345, previous: 11000, delta_pct: 12.23 },
    current_streak: 3,
    longest_streak: 5,
    days_since_last: 1,
  },
  volume_series: [
    { bucket_start: '2026-09-07T00:00:00Z', volume: 4000, sets: 30 },
    { bucket_start: '2026-09-14T00:00:00Z', volume: 8345, sets: 42 },
  ],
  muscle_groups: [
    { muscle_group: 'chest', sets: 16, volume: 3200, frequency: 2, undertrained: false },
    { muscle_group: 'calves', sets: 3, volume: 400, frequency: 1, undertrained: true },
  ],
  trending_up: [
    { exercise_id: 'ex-bench', name: 'Bench Press', direction: 'up', change: 2.5, stalled: false, sessions: 4 },
  ],
  stalled: [
    { exercise_id: 'ex-squat', name: 'Squat', direction: 'flat', change: 0, stalled: true, sessions: 3 },
  ],
  records: [
    { exercise_id: 'ex-dead', name: 'Deadlift', heaviest_weight: 180, heaviest_reps: 3, est_one_rm: 198, is_new_this_window: true },
  ],
  calendar: [{ date: '2026-09-15', count: 1 }],
}

function renderPage(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/exercises/:id/history" element={<div>History for exercise</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function lastUrl(fetchMock: ReturnType<typeof vi.fn>): string {
  const calls = fetchMock.mock.calls
  return String(calls[calls.length - 1][0])
}

describe('DashboardPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('renders four overview tiles with informational values and the cards', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, FULL_DASHBOARD))
    renderPage(fetchMock)

    // Four overview tiles, each with a proper label + informational value.
    expect(await screen.findByText('Workouts')).toBeInTheDocument()
    expect(screen.getByText('Training time')).toBeInTheDocument()
    expect(screen.getByText('Total volume')).toBeInTheDocument()
    expect(screen.getByText('Current streak')).toBeInTheDocument()

    // Values carry units / are self-describing, not bare numbers.
    expect(screen.getByText('8')).toBeInTheDocument() // workouts count
    expect(screen.getByText('5h 20m')).toBeInTheDocument() // 320 training minutes
    expect(screen.getByText('12k')).toBeInTheDocument() // compact volume (kg unit alongside)
    expect(screen.getByText('kg')).toBeInTheDocument() // volume unit label

    // The dropped "days since last" tile is gone (kept to 4 for a clean 2×2).
    expect(screen.queryByText(/days since last/i)).not.toBeInTheDocument()

    // Progress signals + PR + muscle balance.
    expect(screen.getByText('Bench Press')).toBeInTheDocument()
    expect(screen.getByText('Squat')).toBeInTheDocument()
    expect(screen.getByText('Deadlift')).toBeInTheDocument()
    expect(screen.getByText('New PR ✨')).toBeInTheDocument()
    expect(screen.getByText('Chest')).toBeInTheDocument()
    // Undertrained group flagged.
    expect(screen.getByText('Low')).toBeInTheDocument()
  })

  it('fetches month by default and refetches with the new window on selector change', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, FULL_DASHBOARD))
    renderPage(fetchMock)

    await screen.findByText('8')
    expect(lastUrl(fetchMock)).toContain('window=month')

    await userEvent.click(screen.getByRole('tab', { name: 'Week' }))
    await waitFor(() => expect(lastUrl(fetchMock)).toContain('window=week'))
  })

  it('shows an encouraging empty state when there are no sessions', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, EMPTY_DASHBOARD))
    renderPage(fetchMock)

    expect(await screen.findByText('No progress yet.')).toBeInTheDocument()
    expect(screen.getByText(/Finish your first workout/)).toBeInTheDocument()
  })

  it('links a trending exercise row to its history page', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, FULL_DASHBOARD))
    renderPage(fetchMock)

    const benchLink = (await screen.findByText('Bench Press')).closest('a')
    expect(benchLink).toHaveAttribute('href', '/exercises/ex-bench/history')

    const prLink = screen.getByText('Deadlift').closest('a')
    expect(prLink).toHaveAttribute('href', '/exercises/ex-dead/history')
  })
})
