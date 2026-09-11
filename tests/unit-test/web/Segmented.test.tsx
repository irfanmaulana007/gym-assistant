import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Segmented } from '@/components/Segmented'

const OPTIONS = [
  { value: 'info', label: 'Info' },
  { value: 'progress', label: 'Progress' },
  { value: 'history', label: 'History' },
] as const

describe('Segmented', () => {
  it('marks the active option as selected via aria-selected', () => {
    render(<Segmented options={[...OPTIONS]} value="progress" onChange={() => {}} ariaLabel="Sections" />)
    expect(screen.getByRole('tab', { name: 'Progress' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Info' })).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onChange with the clicked option value', async () => {
    const onChange = vi.fn()
    render(<Segmented options={[...OPTIONS]} value="info" onChange={onChange} />)
    await userEvent.click(screen.getByRole('tab', { name: 'History' }))
    expect(onChange).toHaveBeenCalledWith('history')
  })
})
