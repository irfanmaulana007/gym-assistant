import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Switch } from '@/components/Switch'

// PRD 0015 — the native toggle used by the "Include cardio" control.
describe('Switch', () => {
  it('reflects its checked state via role="switch" and aria-checked', () => {
    const { rerender } = render(<Switch label="Include cardio" checked={false} onChange={() => {}} />)
    const sw = screen.getByRole('switch', { name: 'Include cardio' })
    expect(sw).toHaveAttribute('aria-checked', 'false')

    rerender(<Switch label="Include cardio" checked onChange={() => {}} />)
    expect(sw).toHaveAttribute('aria-checked', 'true')
  })

  it('fires onChange with the toggled value when clicked', async () => {
    const onChange = vi.fn()
    render(<Switch label="Include cardio" checked={false} onChange={onChange} />)

    await userEvent.click(screen.getByRole('switch', { name: 'Include cardio' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
