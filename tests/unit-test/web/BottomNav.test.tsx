import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BottomNav } from '@/components/BottomNav'

// The bottom tab bar replaces the header account button (PRD 0005): top-level
// navigation (Home / Progress / Profile) lives here, Instagram-style, and the
// tab matching the current route is marked active. Progress is added by PRD 0007.

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  )
}

describe('BottomNav', () => {
  it('renders Home, Progress and Profile tabs linking to their routes', () => {
    renderAt('/')
    const home = screen.getByRole('link', { name: 'Home' })
    const progress = screen.getByRole('link', { name: 'Progress' })
    const profile = screen.getByRole('link', { name: 'Profile' })
    expect(home).toHaveAttribute('href', '/')
    expect(progress).toHaveAttribute('href', '/progress')
    expect(profile).toHaveAttribute('href', '/profile')
  })

  it('marks the Progress tab active on the progress route', () => {
    renderAt('/progress')
    expect(screen.getByRole('link', { name: 'Progress' }).className).toContain('is-active')
    expect(screen.getByRole('link', { name: 'Home' }).className).not.toContain('is-active')
  })

  it('marks the Home tab active on the home route', () => {
    renderAt('/')
    expect(screen.getByRole('link', { name: 'Home' }).className).toContain('is-active')
    expect(screen.getByRole('link', { name: 'Profile' }).className).not.toContain('is-active')
  })

  it('marks the Profile tab active on the profile route', () => {
    renderAt('/profile')
    expect(screen.getByRole('link', { name: 'Profile' }).className).toContain('is-active')
    expect(screen.getByRole('link', { name: 'Home' }).className).not.toContain('is-active')
  })

  it('does not activate Home on a nested route (end matching)', () => {
    renderAt('/routines/abc')
    expect(screen.getByRole('link', { name: 'Home' }).className).not.toContain('is-active')
  })
})
