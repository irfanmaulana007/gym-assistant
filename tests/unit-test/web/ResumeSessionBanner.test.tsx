import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ResumeSessionBanner } from '@/components/ResumeSessionBanner'
import type { WorkoutSession } from '@/types/api'

// The banner's render logic is what we're unit-testing here; the query itself is
// covered by useActiveSession.test.tsx, so we mock the hook and drive it.
const mockUseActiveSession = vi.fn()
vi.mock('@/hooks/useActiveSession', () => ({
  ACTIVE_SESSION_KEY: ['active-session'],
  useActiveSession: () => mockUseActiveSession(),
}))

function session(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 's1',
    user_id: 'u1',
    routine_id: 'r1',
    status: 'active',
    performed_at: '2026-09-12T04:57:37Z',
    started_at: '2026-09-12T04:57:37Z',
    ended_at: null,
    total_duration_seconds: null,
    active_duration_seconds: null,
    paused_duration_seconds: null,
    muscle_groups: [],
    notes: '',
    metadata: {},
    ...overrides,
  }
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ResumeSessionBanner />
    </MemoryRouter>,
  )
}

describe('ResumeSessionBanner', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders a resume link to the running session when one is active', () => {
    mockUseActiveSession.mockReturnValue({ data: session({ id: 'abc' }) })
    renderAt('/')
    const link = screen.getByRole('link', { name: /resume your active workout/i })
    expect(link).toHaveAttribute('href', '/sessions/abc')
    expect(screen.getByText(/workout in progress/i)).toBeInTheDocument()
  })

  it('labels a paused session as paused', () => {
    mockUseActiveSession.mockReturnValue({ data: session({ status: 'paused' }) })
    renderAt('/')
    expect(screen.getByText(/workout paused/i)).toBeInTheDocument()
    expect(screen.getByText('Paused')).toBeInTheDocument()
  })

  it('renders nothing when there is no running session', () => {
    mockUseActiveSession.mockReturnValue({ data: null })
    const { container } = renderAt('/')
    expect(container).toBeEmptyDOMElement()
  })

  it('hides itself while already viewing that session page', () => {
    mockUseActiveSession.mockReturnValue({ data: session({ id: 'abc' }) })
    const { container } = renderAt('/sessions/abc')
    expect(container).toBeEmptyDOMElement()
  })
})
