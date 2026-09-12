import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { EditProfilePage } from '@/features/profile/EditProfilePage'

// A minimal but complete User for the auth context to hydrate from GET /me.
const BASE_USER = {
  id: '1',
  email: 'jane@example.com',
  display_name: 'Jane',
  username: null,
  full_name: null,
  gender: null,
  date_of_birth: null,
  body_weight: null,
  body_weight_unit: null,
  height: null,
  height_unit: null,
  fitness_goal: null,
  activity_level: null,
  preferred_weight_unit: 'kg',
  preferred_height_unit: 'cm',
  avatar_url: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/profile/edit']}>
        <AuthProvider>
          <EditProfilePage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('EditProfilePage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('PATCHes the edited subset including the preferred units', async () => {
    localStorage.setItem('gym.token', 'jwt-token')
    const patchBodies: unknown[] = []
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (method === 'PATCH') {
        patchBodies.push(JSON.parse(String(init?.body)))
        return jsonResponse(200, { ...BASE_USER, gender: 'female', body_weight: 68, preferred_weight_unit: 'lb' })
      }
      return jsonResponse(200, BASE_USER)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    // Wait for the auth context to hydrate and the form to render.
    const save = await screen.findByRole('button', { name: /save profile/i })

    await userEvent.selectOptions(screen.getByLabelText('Gender'), 'female')
    await userEvent.type(screen.getByLabelText('Body weight'), '68')
    // Switch the preferred weight unit to lb (distinct from the body-weight
    // unit control by its aria-label).
    const prefWeight = screen.getByRole('tablist', { name: 'Preferred weight unit' })
    await userEvent.click(within(prefWeight).getByRole('tab', { name: 'lb' }))

    await userEvent.click(save)

    await waitFor(() => expect(patchBodies.length).toBe(1))
    expect(patchBodies[0]).toMatchObject({
      gender: 'female',
      body_weight: 68,
      preferred_weight_unit: 'lb',
      preferred_height_unit: 'cm',
    })
  })
})
