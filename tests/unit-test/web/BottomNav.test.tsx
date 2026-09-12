import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BottomNav } from '@/components/BottomNav'
import { AuthProvider } from '@/lib/auth'

// The bottom tab bar replaces the header account button (PRD 0005): top-level
// navigation lives here, Instagram-style, and the tab matching the current route
// is marked active. Per PRD 0007 the order is Progress (landing, `/`) · Workout
// (`/workout`) · Profile (`/profile`). The Profile tab shows the user's avatar
// when set (PRD 0008).

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <BottomNav />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('BottomNav', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('renders Progress, Workout and Profile tabs linking to their routes', () => {
    renderAt('/')
    const progress = screen.getByRole('link', { name: 'Progress' })
    const workout = screen.getByRole('link', { name: 'Workout' })
    const profile = screen.getByRole('link', { name: 'Profile' })
    expect(progress).toHaveAttribute('href', '/')
    expect(workout).toHaveAttribute('href', '/workout')
    expect(profile).toHaveAttribute('href', '/profile')
  })

  it('marks the Progress tab active on the landing route', () => {
    renderAt('/')
    expect(screen.getByRole('link', { name: 'Progress' }).className).toContain('is-active')
    expect(screen.getByRole('link', { name: 'Workout' }).className).not.toContain('is-active')
  })

  it('marks the Workout tab active on the workout route', () => {
    renderAt('/workout')
    expect(screen.getByRole('link', { name: 'Workout' }).className).toContain('is-active')
    expect(screen.getByRole('link', { name: 'Progress' }).className).not.toContain('is-active')
  })

  it('marks the Profile tab active on the profile route', () => {
    renderAt('/profile')
    expect(screen.getByRole('link', { name: 'Profile' }).className).toContain('is-active')
    expect(screen.getByRole('link', { name: 'Progress' }).className).not.toContain('is-active')
  })

  it('does not activate Progress on a nested route (end matching)', () => {
    renderAt('/routines/abc')
    expect(screen.getByRole('link', { name: 'Progress' }).className).not.toContain('is-active')
  })

  it('shows the generic icon (no avatar image) when the user has no avatar', () => {
    renderAt('/profile')
    const profile = screen.getByRole('link', { name: 'Profile' })
    expect(profile.querySelector('img.bottom-nav-avatar')).toBeNull()
  })

  it('shows the avatar image on the Profile tab when the user has one', async () => {
    localStorage.setItem('gym.token', 'jwt-token')
    const avatar = 'data:image/png;base64,AAAA'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ id: '1', email: 'a@b.com', display_name: 'A', avatar_url: avatar }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    const { container } = renderAt('/profile')
    await waitFor(() => {
      const img = container.querySelector('img.bottom-nav-avatar') as HTMLImageElement | null
      expect(img).not.toBeNull()
      expect(img?.src).toContain(avatar)
    })
  })
})
