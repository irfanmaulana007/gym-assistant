import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SessionSummary } from '@/features/sessions/SessionSummary'
import type { SetEntry, SessionExercise, WorkoutSession } from '@/types/api'

// A logged set with sensible defaults for the fields the summary ignores.
function entry(over: Partial<SetEntry>): SetEntry {
  return {
    id: `set-${Math.random()}`,
    session_exercise_id: 'sx1',
    entry_number: 1,
    weight: null,
    weight_unit: null,
    reps: null,
    duration_seconds: null,
    distance: null,
    distance_unit: null,
    incline: null,
    speed: null,
    rpe: null,
    is_completed: true,
    performed_at: '2026-09-10T10:00:00Z',
    metadata: {},
    created_at: '2026-09-10T10:00:00Z',
    ...over,
  }
}

function exercise(over: Partial<SessionExercise>): SessionExercise {
  return {
    id: 'sx1',
    session_id: 's1',
    exercise_id: 'e1',
    position: 0,
    name_snapshot: 'Bench Press',
    measurement_type: 'weight_reps',
    target_sets: 3,
    target_reps: 8,
    target_weight: null,
    target_duration_seconds: null,
    primary_muscle_group: 'chest',
    secondary_muscle_groups: [],
    status: 'completed',
    completed_at: '2026-09-10T10:20:00Z',
    sets_completed: 0,
    total_reps: null,
    total_volume: null,
    total_duration_seconds: null,
    top_set_weight: null,
    metadata: {},
    entries: [],
    last_set: null,
    ...over,
  }
}

function session(exercises: SessionExercise[]): WorkoutSession {
  return {
    id: 's1',
    user_id: 'u1',
    routine_id: 'r1',
    status: 'completed',
    performed_at: '2026-09-10T10:00:00Z',
    started_at: '2026-09-10T10:00:00Z',
    ended_at: '2026-09-10T10:30:00Z',
    total_duration_seconds: 1800,
    active_duration_seconds: 1500,
    paused_duration_seconds: 300,
    muscle_groups: ['chest'],
    notes: '',
    metadata: {},
    exercises,
  }
}

function renderSummary(s: WorkoutSession) {
  return render(
    <MemoryRouter>
      <SessionSummary session={s} />
    </MemoryRouter>,
  )
}

describe('SessionSummary — per-set expand/collapse', () => {
  afterEach(() => vi.restoreAllMocks())

  it('hides each set until the exercise is expanded, then reveals weight × reps per set', async () => {
    const bench = exercise({
      name_snapshot: 'Bench Press',
      sets_completed: 3,
      top_set_weight: 62.5,
      entries: [
        entry({ entry_number: 1, weight: 60, weight_unit: 'kg', reps: 8 }),
        entry({ entry_number: 2, weight: 62.5, weight_unit: 'kg', reps: 6 }),
        entry({ entry_number: 3, weight: 57.5, weight_unit: 'kg', reps: 8 }),
      ],
    })
    renderSummary(session([bench]))

    // Collapsed: the one-line summary is shown, individual sets are not.
    expect(screen.getByText('Bench Press')).toBeInTheDocument()
    expect(screen.getByText(/3 sets · top 62\.5kg/)).toBeInTheDocument()
    expect(screen.queryByText('60kg × 8')).not.toBeInTheDocument()
    expect(screen.queryByText('62.5kg × 6')).not.toBeInTheDocument()

    // Expanding reveals every logged set — including the ones that differ from
    // the top set, which the collapsed summary can't show.
    await userEvent.click(screen.getByRole('button', { name: /show sets for bench press/i }))
    expect(screen.getByText('60kg × 8')).toBeInTheDocument()
    expect(screen.getByText('62.5kg × 6')).toBeInTheDocument()
    expect(screen.getByText('57.5kg × 8')).toBeInTheDocument()
    expect(screen.getByText('Set 3')).toBeInTheDocument()
  })

  it('renders a plain, non-expandable row for an exercise with no logged sets', () => {
    const skipped = exercise({ name_snapshot: 'Incline Press', sets_completed: 0, entries: [] })
    renderSummary(session([skipped]))

    expect(screen.getByText('Incline Press')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show sets for incline press/i })).not.toBeInTheDocument()
  })
})
