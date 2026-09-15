import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { ActiveSessionPage } from '@/features/sessions/ActiveSessionPage'
import type { SessionExercise } from '@/types/api'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const SESSION_ID = 's1'

function exercise(id: string, name: string, status: SessionExercise['status'], position: number): SessionExercise {
  return {
    id,
    session_id: SESSION_ID,
    exercise_id: null,
    position,
    name_snapshot: name,
    measurement_type: 'weight_reps',
    target_sets: 3,
    target_reps: 10,
    target_weight: null,
    target_duration_seconds: null,
    primary_muscle_group: 'other',
    secondary_muscle_groups: [],
    status,
    completed_at: status === 'completed' ? '2026-09-10T10:05:00Z' : null,
    sets_completed: 0,
    total_reps: null,
    total_volume: null,
    total_duration_seconds: null,
    top_set_weight: null,
    metadata: {},
    entries: [],
    last_set: null,
  }
}

function sessionWith(exercises: SessionExercise[]) {
  return {
    id: SESSION_ID,
    user_id: 'u1',
    routine_id: 'r1',
    status: 'active',
    performed_at: '2026-09-10T10:00:00Z',
    started_at: '2026-09-10T10:00:00Z',
    ended_at: null,
    total_duration_seconds: null,
    active_duration_seconds: null,
    paused_duration_seconds: null,
    muscle_groups: [],
    notes: '',
    metadata: {},
    exercises,
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

// Reads the rendered exercise names in DOM order from the session list.
function renderedOrder(): string[] {
  return Array.from(document.querySelectorAll('li.list-item[data-flip-key] strong')).map(
    (el) => el.textContent ?? '',
  )
}

describe('ActiveSessionPage — auto-sort completed exercises to the bottom', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('renders not-done exercises on top and completed ones at the bottom', async () => {
    // Server returns them interleaved by position; the UI must sink the
    // completed ones so what's left to do stays in reach.
    const exercises = [
      exercise('e1', 'Bench Press', 'completed', 0),
      exercise('e2', 'Incline Press', 'pending', 1),
      exercise('e3', 'Chest Fly', 'completed', 2),
      exercise('e4', 'Triceps Pushdown', 'pending', 3),
    ]
    renderPage(vi.fn(async () => jsonResponse(200, sessionWith(exercises))) as unknown as typeof fetch)

    await screen.findByText('Bench Press')

    await waitFor(() =>
      expect(renderedOrder()).toEqual([
        'Incline Press',
        'Triceps Pushdown',
        'Bench Press',
        'Chest Fly',
      ]),
    )
  })

  it('keeps original (position) order within the not-done and done groups', async () => {
    const exercises = [
      exercise('e1', 'A', 'pending', 0),
      exercise('e2', 'B', 'completed', 1),
      exercise('e3', 'C', 'pending', 2),
      exercise('e4', 'D', 'completed', 3),
    ]
    renderPage(vi.fn(async () => jsonResponse(200, sessionWith(exercises))) as unknown as typeof fetch)

    await screen.findByText('A')

    // Pending A, C keep their order; completed B, D keep theirs — just moved down.
    await waitFor(() => expect(renderedOrder()).toEqual(['A', 'C', 'B', 'D']))
  })
})
