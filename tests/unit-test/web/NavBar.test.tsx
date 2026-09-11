import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NavBar } from '@/components/NavBar'

// The header title is native-app chrome for CHILD screens only: it renders only
// when the screen was pushed with a back chevron. Top-level tab screens
// (Home/Profile) pass no `back`, carry their own in-body heading, and so show an
// empty nav bar — the title would just be redundant. See PRD 0005 and
// .claude/rules/native-mobile-ux.md.

function renderNav(props: Parameters<typeof NavBar>[0]) {
  return render(
    <MemoryRouter>
      <NavBar {...props} />
    </MemoryRouter>,
  )
}

describe('NavBar', () => {
  it('shows the title on a child screen (has a back target)', () => {
    renderNav({ title: 'Leg Day', back: '/', backLabel: 'Workouts' })
    expect(screen.getByRole('heading', { name: 'Leg Day' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Workouts' })).toBeInTheDocument()
  })

  it('shows the title when back is the boolean history sentinel (back={true})', () => {
    renderNav({ title: 'History', back: true })
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument()
  })

  it('hides the title on a top-level screen (no back target)', () => {
    renderNav({ title: 'Workouts' })
    expect(screen.queryByRole('heading', { name: 'Workouts' })).not.toBeInTheDocument()
    // No back chevron either — a root tab screen has an empty nav bar.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('treats back={false} as no back target and hides the title', () => {
    renderNav({ title: 'Profile', back: false })
    expect(screen.queryByRole('heading', { name: 'Profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
