import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorFallback } from '@/components/ErrorFallback'

// The crash fallback must render a message and a working Reload action built
// from the design-system button primitive (per .claude/rules/native-mobile-ux.md).
describe('ErrorFallback', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the error message and a Reload button', () => {
    render(<ErrorFallback />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    const button = screen.getByRole('button', { name: /reload/i })
    expect(button).toHaveClass('btn', 'btn-primary', 'btn-block')
  })

  it('reloads the page when Reload is pressed', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    })

    render(<ErrorFallback />)
    await userEvent.click(screen.getByRole('button', { name: /reload/i }))
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
