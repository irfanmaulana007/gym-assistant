import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { ProfileMenu } from '@/components/ProfileMenu'

// Component test for the top-right account control: the avatar opens a native
// popover menu with the signed-in identity and a logout action that clears the
// stored token.

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderMenu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AuthProvider>
          <ProfileMenu />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProfileMenu', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('shows the user initials and reveals identity + logout on tap', async () => {
    localStorage.setItem('gym.token', 'jwt-token')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, { id: '1', email: 'jane@example.com', display_name: 'Jane Doe' }),
      ),
    )

    renderMenu()

    // Avatar renders derived initials once the user is hydrated.
    const avatar = await screen.findByRole('button', { name: /account menu/i })
    expect(avatar).toHaveTextContent('JD')

    // Menu is closed until tapped.
    expect(screen.queryByText('jane@example.com')).not.toBeInTheDocument()

    await userEvent.click(avatar)

    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('jane@example.com')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /logout/i })).toBeInTheDocument()
  })

  it('logs the user out and clears the token', async () => {
    localStorage.setItem('gym.token', 'jwt-token')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, { id: '1', email: 'jane@example.com', display_name: 'Jane Doe' }),
      ),
    )

    renderMenu()
    const avatar = await screen.findByRole('button', { name: /account menu/i })
    await userEvent.click(avatar)
    await userEvent.click(screen.getByRole('menuitem', { name: /logout/i }))

    await waitFor(() => expect(localStorage.getItem('gym.token')).toBeNull())
    // With no user, the control unmounts entirely.
    expect(screen.queryByRole('button', { name: /account menu/i })).not.toBeInTheDocument()
  })
})
