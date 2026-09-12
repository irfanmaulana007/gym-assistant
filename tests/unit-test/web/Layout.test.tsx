import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { AuthProvider } from '@/lib/auth'

// The top nav bar is native-app chrome for CHILD screens only. Top-level tab
// screens and full-screen flows pass no `back` and carry their own in-body
// heading, so Layout omits the nav bar ENTIRELY rather than render an empty
// <header> — an empty bar left a blank strip at the top of the page. When the
// bar is dropped, the shell is flagged `no-header` so the CSS keeps the
// safe-area inset. See PRD 0005 and .claude/rules/native-mobile-ux.md.

function renderLayout(props: Partial<Parameters<typeof Layout>[0]> = {}) {
  const { title = 'Screen', children = <p>body</p>, ...rest } = props
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Layout title={title} {...rest}>
          {children}
        </Layout>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Layout header', () => {
  it('renders the nav bar (banner) with the title on a child screen', () => {
    renderLayout({ title: 'Leg Day', back: '/', backLabel: 'Workouts' })
    const banner = screen.getByRole('banner')
    expect(banner).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Leg Day' })).toBeInTheDocument()
  })

  it('omits the nav bar entirely on a top-level screen (no back target)', () => {
    const { container } = renderLayout({ title: 'Workouts', bottomNav: true })
    // No empty <header> left behind → no blank strip at the top.
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(container.querySelector('.app-shell')).toHaveClass('no-header')
  })

  it('treats back={false} as no back target and omits the nav bar', () => {
    const { container } = renderLayout({ title: 'Active workout', back: false })
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(container.querySelector('.app-shell')).toHaveClass('no-header')
  })

  it('does not flag the shell no-header when a header is present', () => {
    const { container } = renderLayout({ title: 'History', back: true })
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(container.querySelector('.app-shell')).not.toHaveClass('no-header')
  })
})
