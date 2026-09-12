import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { AuthProvider } from '@/lib/auth'

// Registration gains an optional username field (PRD 0008).
function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

function okResponse() {
  return new Response(
    JSON.stringify({ token: 'jwt-token', user: { id: '1', email: 'a@b.com', display_name: 'A' } }),
    { status: 201, headers: { 'Content-Type': 'application/json' } },
  )
}

describe('RegisterPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('posts the optional username when provided', async () => {
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)

    renderRegister()
    await userEvent.type(screen.getByLabelText('Display name'), 'Athlete')
    await userEvent.type(screen.getByLabelText(/username/i), 'athlete1')
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com')
    await userEvent.type(screen.getByLabelText('Password'), 'supersecret1')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => expect(localStorage.getItem('gym.token')).toBe('jwt-token'))
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body).toMatchObject({ email: 'a@b.com', display_name: 'Athlete', username: 'athlete1' })
  })

  it('omits username when left blank', async () => {
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)

    renderRegister()
    await userEvent.type(screen.getByLabelText('Display name'), 'Athlete')
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com')
    await userEvent.type(screen.getByLabelText('Password'), 'supersecret1')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => expect(localStorage.getItem('gym.token')).toBe('jwt-token'))
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body).not.toHaveProperty('username')
  })
})
