import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BottomNav } from '@/components/BottomNav'

// The bottom tab bar replaces the header account button (PRD 0005): top-level
// navigation lives here, Instagram-style, and the tab matching the current route
// is marked active. Per PRD 0007 the order is Progress (landing, `/`) · Workout
// (`/workout`) · Profile (`/profile`).

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  )
}

describe('BottomNav', () => {
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
})
