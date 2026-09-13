import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { ExerciseCard } from '@/features/sessions/ExerciseCard'
import type { SessionExercise } from '@/types/api'

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
