import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { ExerciseCard } from '@/features/sessions/ExerciseCard'
import type { SessionExercise, WorkoutSession } from '@/types/api'

// Optimistic logging (React Query onMutate): clicking "Log" and toggling "done"
// update the cached session immediately, so the row reflects the tap before the
// API round-trip finishes — and roll back if the request fails.

const SESSION_ID = 's1'

function makeSession(): WorkoutSession {
  const sx: SessionExercise = {
    id: 'sx1',
    session_id: SESSION_ID,
    exercise_id: 'e1',
    position: 0,
    name_snapshot: 'Bench',
    measurement_type: 'weight_reps',
    target_sets: 3,
    target_reps: 8,
    target_weight: null,
    target_duration_seconds: null,
    primary_muscle_group: 'chest',
    secondary_muscle_groups: [],
    status: 'pending',
    completed_at: null,
    sets_completed: 0,
    total_reps: null,
    total_volume: null,
    total_duration_seconds: null,
    top_set_weight: null,
    metadata: {},
    entries: [],
  }
  return {
    id: SESSION_ID,
    user_id: 'u1',
    routine_id: 'r1',
    status: 'active',
    performed_at: '2026-01-01T00:00:00Z',
    started_at: '2026-01-01T00:00:00Z',
    ended_at: null,
    total_duration_seconds: null,
    active_duration_seconds: null,
    paused_duration_seconds: null,
    muscle_groups: ['chest'],
    notes: '',
    metadata: {},
    exercises: [sx],
  }
}

// The "server" the harness query reads from. Tests never mutate it, so a refetch
// (triggered by onSettled) always returns the pre-log truth — proving that any
// logged set on screen came from the optimistic cache write, not the server.
let serverSession: WorkoutSession

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// Mirrors ActiveSessionPage: reads the session from the ['session', id] query and
// renders each exercise as an ExerciseCard, so the card's optimistic cache write
// is reflected in the DOM exactly as it would be in the real app.
function SessionExercises() {
  const { data } = useQuery({
    queryKey: ['session', SESSION_ID],
    queryFn: () => Promise.resolve(serverSession),
  })
  if (!data?.exercises) return null
  return (
    <ul>
      {data.exercises.map((sx) => (
        <ExerciseCard key={sx.id} sessionId={SESSION_ID} sx={sx} disabled={false} />
      ))}
    </ul>
  )
}

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AuthProvider>
          <SessionExercises />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ExerciseCard optimistic logging', () => {
  beforeEach(() => {
    serverSession = makeSession()
    localStorage.setItem('gym.token', 'jwt-token')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('shows the logged set immediately, before the addEntry request resolves', async () => {
    // addEntry never resolves — if the set shows, it can only be the optimistic write.
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (url.includes('/auth/me')) {
          return Promise.resolve(jsonResponse({ id: 'u1', email: 'a@b.com', display_name: 'A', preferred_weight_unit: 'kg' }))
        }
        if (method === 'POST' && url.includes('/entries')) {
          return new Promise<Response>(() => {}) // hang forever
        }
        return Promise.resolve(jsonResponse(serverSession))
      }),
    )

    renderCard()

    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Bench weight'), '60')
    await user.type(screen.getByLabelText('Bench reps'), '8')
    await user.click(screen.getByRole('button', { name: /^log$/i }))

    // The set appears without the request ever completing.
    expect(await screen.findByText('Set 1')).toBeInTheDocument()
    expect(screen.getByText(/60kg × 8/)).toBeInTheDocument()
    // Inputs are cleared so the next set can be logged right away.
    expect((screen.getByLabelText('Bench weight') as HTMLInputElement).value).toBe('')
  })

  it('marks the exercise done immediately, before the status request resolves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (url.includes('/auth/me')) {
          return Promise.resolve(jsonResponse({ id: 'u1', email: 'a@b.com', display_name: 'A', preferred_weight_unit: 'kg' }))
        }
        if (method === 'PATCH' && url.includes('/session-exercises/')) {
          return new Promise<Response>(() => {}) // hang forever
        }
        return Promise.resolve(jsonResponse(serverSession))
      }),
    )

    renderCard()

    const user = userEvent.setup()
    const toggle = await screen.findByRole('button', { name: /mark bench done/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await user.click(toggle)

    // Flips to done instantly, without the PATCH resolving.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mark bench not done/i })).toHaveAttribute('aria-pressed', 'true'),
    )
  })

  it('rolls the logged set back when the addEntry request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (url.includes('/auth/me')) {
          return Promise.resolve(jsonResponse({ id: 'u1', email: 'a@b.com', display_name: 'A', preferred_weight_unit: 'kg' }))
        }
        if (method === 'POST' && url.includes('/entries')) {
          // Reject after a beat so the optimistic entry is observable before the
          // failure rolls it back.
          return new Promise<Response>((resolve) =>
            setTimeout(() => resolve(jsonResponse({ error: { code: 'server_error', message: 'boom' } }, 500)), 100),
          )
        }
        return Promise.resolve(jsonResponse(serverSession))
      }),
    )

    renderCard()

    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Bench weight'), '60')
    await user.type(screen.getByLabelText('Bench reps'), '8')
    await user.click(screen.getByRole('button', { name: /^log$/i }))

    // Appears optimistically…
    expect(await screen.findByText('Set 1')).toBeInTheDocument()
    // …then the failed request rolls it back to the server truth (no entries).
    await waitFor(() => expect(screen.queryByText('Set 1')).not.toBeInTheDocument())
  })
})
