import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ExercisePickerSheet } from '@/features/exercises/ExercisePickerSheet'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const CATALOG = [
  {
    id: 'c-bench',
    name: 'Barbell Bench Press',
    primary_muscle_group: 'chest',
    secondary_muscle_groups: ['triceps'],
    default_measurement_type: 'weight_reps',
    created_at: '',
    updated_at: '',
  },
  {
    id: 'c-squat',
    name: 'Barbell Back Squat',
    primary_muscle_group: 'quads',
    secondary_muscle_groups: ['glutes'],
    default_measurement_type: 'weight_reps',
    created_at: '',
    updated_at: '',
  },
  {
    id: 'c-plank',
    name: 'Plank',
    primary_muscle_group: 'core',
    secondary_muscle_groups: [],
    default_measurement_type: 'duration',
    created_at: '',
    updated_at: '',
  },
]

// mockFetch handles the catalog list + exercise create, capturing POST bodies.
function mockFetch() {
  const posts: { url: string; body: any }[] = []
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    const method = init?.method ?? 'GET'
    if (u.includes('/api/v1/exercise-catalog')) {
      return jsonResponse(200, { exercises: CATALOG })
    }
    if (method === 'POST' && u.includes('/exercises')) {
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      posts.push({ url: u, body })
      return jsonResponse(201, { id: 'new-ex', routine_id: 'r1', ...body })
    }
    return jsonResponse(200, {})
  })
  vi.stubGlobal('fetch', fetchMock)
  return posts
}

function renderSheet() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onAdded = vi.fn()
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={qc}>
      <ExercisePickerSheet open onClose={onClose} routineId="r1" onAdded={onAdded} />
    </QueryClientProvider>,
  )
  return { onAdded, onClose }
}

describe('ExercisePickerSheet', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('lists catalog entries', async () => {
    mockFetch()
    renderSheet()
    expect(await screen.findByText('Barbell Bench Press')).toBeInTheDocument()
    expect(screen.getByText('Barbell Back Squat')).toBeInTheDocument()
    expect(screen.getByText('Plank')).toBeInTheDocument()
  })

  it('searches the catalog by name', async () => {
    mockFetch()
    renderSheet()
    await screen.findByText('Barbell Bench Press')
    await userEvent.type(screen.getByLabelText('Search'), 'squat')
    await waitFor(() => expect(screen.queryByText('Barbell Bench Press')).not.toBeInTheDocument())
    expect(screen.getByText('Barbell Back Squat')).toBeInTheDocument()
  })

  it('filters the catalog by muscle-group chip', async () => {
    mockFetch()
    renderSheet()
    await screen.findByText('Barbell Bench Press')
    const filterGroup = screen.getByRole('group', { name: /filter by muscle group/i })
    await userEvent.click(within(filterGroup).getByRole('button', { name: 'Core' }))
    await waitFor(() => expect(screen.queryByText('Barbell Bench Press')).not.toBeInTheDocument())
    expect(screen.getByText('Plank')).toBeInTheDocument()
  })

  it('posts catalog_exercise_id + targets and no muscle fields when picking a catalog entry', async () => {
    const posts = mockFetch()
    const { onAdded } = renderSheet()
    await userEvent.click(await screen.findByRole('button', { name: /add barbell bench press/i }))

    // Targets step: save.
    await userEvent.click(await screen.findByRole('button', { name: /^add barbell bench press$/i }))

    await waitFor(() => expect(posts.length).toBe(1))
    const { body } = posts[0]
    expect(body.catalog_exercise_id).toBe('c-bench')
    expect(body.target_sets).toBe(3)
    expect(body.target_reps).toBe(12)
    expect(body).not.toHaveProperty('primary_muscle_group')
    expect(body).not.toHaveProperty('secondary_muscle_groups')
    expect(body).not.toHaveProperty('name')
    expect(onAdded).toHaveBeenCalled()
  })

  it('falls back to the free-text custom form and posts a custom exercise', async () => {
    const posts = mockFetch()
    renderSheet()
    await screen.findByText('Barbell Bench Press')

    await userEvent.click(screen.getByRole('button', { name: /custom exercise/i }))

    // The free-text form renders a Name field + primary muscle-group select.
    const nameInput = await screen.findByLabelText('Name')
    await userEvent.type(nameInput, 'Banded Pull-Apart')
    const muscleSelect = screen.getByLabelText('Primary muscle group') as HTMLSelectElement
    await userEvent.selectOptions(muscleSelect, 'shoulders')

    await userEvent.click(screen.getByRole('button', { name: /save exercise/i }))

    await waitFor(() => expect(posts.length).toBe(1))
    const { body } = posts[0]
    expect(body.name).toBe('Banded Pull-Apart')
    expect(body.primary_muscle_group).toBe('shoulders')
    expect(body).not.toHaveProperty('catalog_exercise_id')
  })
})
