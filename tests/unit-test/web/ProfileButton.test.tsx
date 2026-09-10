import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { ProfileButton } from '@/components/ProfileButton'

// Component test for the top-right account control. Native-mobile behaviour:
// the avatar navigates to the full Profile screen — it does NOT open a
// desktop-style dropdown menu (see .claude/rules/native-mobile-ux.md).

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderButton() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<ProfileButton />} />
            <Route path="/profile" element={<div>Profile screen</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProfileButton', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('shows the user initials', async () => {
    localStorage.setItem('gym.token', 'jwt-token')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, { id: '1', email: 'jane@example.com', display_name: 'Jane Doe' }),
      ),
    )

    renderButton()

    const avatar = await screen.findByRole('button', { name: /profile/i })
    expect(avatar).toHaveTextContent('JD')
  })

  it('navigates to the profile screen on tap instead of opening a dropdown', async () => {
    localStorage.setItem('gym.token', 'jwt-token')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, { id: '1', email: 'jane@example.com', display_name: 'Jane Doe' }),
      ),
    )

    renderButton()

    const avatar = await screen.findByRole('button', { name: /profile/i })

    // No popover menu is rendered in the header before (or after) the tap.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()

    await userEvent.click(avatar)

    // Tapping pushes the full profile screen rather than revealing a menu.
    expect(await screen.findByText('Profile screen')).toBeInTheDocument()
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
  })
})
