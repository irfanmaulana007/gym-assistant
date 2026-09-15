import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { ExerciseCard } from '@/features/sessions/ExerciseCard'
import type { SessionExercise, SetEntry } from '@/types/api'

// The set-logging weight input defaults its unit to the user's preferred weight
// unit (PRD 0008 §4.4) rather than a hardcoded kg.
const SX: SessionExercise = {
  id: 'sx1',
  session_id: 's1',
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

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AuthProvider>
          <ExerciseCard sessionId="s1" sx={SX} disabled={false} />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ExerciseCard weight unit default', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('defaults the weight input placeholder to the preferred unit (lb)', async () => {
    localStorage.setItem('gym.token', 'jwt-token')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ id: '1', email: 'a@b.com', display_name: 'A', preferred_weight_unit: 'lb' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    renderCard()

    await waitFor(() => {
      const input = screen.getByLabelText('Bench weight') as HTMLInputElement
      expect(input.placeholder).toBe('lb')
    })
  })

  // PRD 0010: the per-exercise kg/lb toggle lets the user log the machine's
  // actual unit; switching it updates the placeholder and the logged set is
  // stored with the chosen unit (not the preferred one).
  it('logs the set with the unit chosen on the toggle, overriding the preferred unit', async () => {
    localStorage.setItem('gym.token', 'jwt-token')
    // Preferred unit is kg; the machine shows lb, so the user switches the toggle.
    const bodies: unknown[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/entries') && init?.method === 'POST') {
        bodies.push(JSON.parse(init.body as string))
        return new Response(JSON.stringify({ id: 'entry1' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      // /auth/me and anything else: return the user with preferred kg.
      return new Response(
        JSON.stringify({ id: '1', email: 'a@b.com', display_name: 'A', preferred_weight_unit: 'kg' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    renderCard()

    const input = (await screen.findByLabelText('Bench weight')) as HTMLInputElement
    expect(input.placeholder).toBe('kg')

    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'lb' }))
    expect(input.placeholder).toBe('lb')

    await user.type(input, '135')
    await user.type(screen.getByLabelText('Bench reps'), '8')
    await user.click(screen.getByRole('button', { name: 'Log' }))

    await waitFor(() => expect(bodies.length).toBe(1))
    expect(bodies[0]).toMatchObject({ weight: 135, reps: 8, weight_unit: 'lb' })
  })
})

// PRD 0012: a logged set can be corrected (or deleted) in place while the
// session runs. The entry pill exposes an Edit control that pre-fills the
// current values; Save PATCHes /entries/{id} and Delete DELETEs it.
const ENTRY: SetEntry = {
  id: 'en1',
  session_exercise_id: 'sx1',
  entry_number: 1,
  weight: 600,
  weight_unit: 'kg',
  reps: 8,
  duration_seconds: null,
  distance: null,
  distance_unit: null,
  incline: null,
  speed: null,
  rpe: null,
  is_completed: true,
  performed_at: '2026-09-15T10:00:00Z',
  metadata: {},
  created_at: '2026-09-15T10:00:00Z',
}

function renderCardWithEntry() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AuthProvider>
          <ExerciseCard sessionId="s1" sx={{ ...SX, entries: [ENTRY] }} disabled={false} />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ExerciseCard edit/delete a logged set (PRD 0012)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('pre-fills the current weight and PATCHes the corrected value on Save', async () => {
    localStorage.setItem('gym.token', 'jwt-token')
    const calls: { url: string; method: string; body?: string }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        const method = init?.method ?? 'GET'
        calls.push({ url, method, body: init?.body as string | undefined })
        if (method === 'PATCH') {
          return new Response(JSON.stringify({ ...ENTRY, weight: 60 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(
          JSON.stringify({ id: '1', email: 'a@b.com', display_name: 'A', preferred_weight_unit: 'kg' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    renderCardWithEntry()
    const user = userEvent.setup()

    // The set renders read-only, then Edit reveals inputs pre-filled with 600.
    expect(screen.getByText('600kg × 8')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /edit set 1 of bench/i }))
    const weightInput = screen.getByLabelText('Bench set 1 weight') as HTMLInputElement
    expect(weightInput.value).toBe('600')

    await user.clear(weightInput)
    await user.type(weightInput, '60')
    await user.click(screen.getByRole('button', { name: /save set 1 of bench/i }))

    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true))
    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.url).toMatch(/\/api\/v1\/entries\/en1$/)
    expect(JSON.parse(patch.body as string)).toEqual({ weight: 60, reps: 8, weight_unit: 'kg' })
  })

  it('DELETEs the entry when Delete is tapped in the edit state', async () => {
    localStorage.setItem('gym.token', 'jwt-token')
    const calls: { url: string; method: string }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        const method = init?.method ?? 'GET'
        calls.push({ url, method })
        if (method === 'DELETE') return new Response(null, { status: 204 })
        return new Response(
          JSON.stringify({ id: '1', email: 'a@b.com', display_name: 'A', preferred_weight_unit: 'kg' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    renderCardWithEntry()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /edit set 1 of bench/i }))
    await user.click(screen.getByRole('button', { name: /delete set 1 of bench/i }))

    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true))
    const del = calls.find((c) => c.method === 'DELETE')!
    expect(del.url).toMatch(/\/api\/v1\/entries\/en1$/)
  })
})
