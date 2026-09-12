import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChangePasswordPage } from '@/features/profile/ChangePasswordPage'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/profile/password']}>
        <ChangePasswordPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function fill() {
  await userEvent.type(screen.getByLabelText('Current password'), 'originalpass')
  await userEvent.type(screen.getByLabelText('New password'), 'brandnewpass')
  await userEvent.type(screen.getByLabelText('Confirm new password'), 'brandnewpass')
}

describe('ChangePasswordPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('posts current and new passwords', async () => {
    localStorage.setItem('gym.token', 'jwt-token')
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    await fill()
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/v1/auth/change-password')
    expect(JSON.parse(String(init.body))).toEqual({
      current_password: 'originalpass',
      new_password: 'brandnewpass',
    })
  })

  it('surfaces a wrong-current-password 401 inline', async () => {
    localStorage.setItem('gym.token', 'jwt-token')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ error: { code: 'unauthorized', message: 'current password is incorrect' } }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    renderPage()
    await fill()
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByText(/current password is incorrect/i)).toBeInTheDocument()
  })

  it('blocks mismatched confirmation without calling the API', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    await userEvent.type(screen.getByLabelText('Current password'), 'originalpass')
    await userEvent.type(screen.getByLabelText('New password'), 'brandnewpass')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'different')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByText(/do not match/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
