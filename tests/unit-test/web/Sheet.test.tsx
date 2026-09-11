import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Sheet } from '@/components/Sheet'

// A tiny harness so we can drive the Sheet's controlled `open` prop from the UI.
function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>open</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="New workout day">
        <input aria-label="Workout day name" />
      </Sheet>
    </div>
  )
}

describe('Sheet', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is not in the DOM until opened', () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders its content and moves focus inside when opened', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'open' }))

    const dialog = await screen.findByRole('dialog', { name: 'New workout day' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const field = screen.getByLabelText('Workout day name')
    await waitFor(() => expect(field).toHaveFocus())
  })

  it('forces a reflow of the off-screen panel before adding `is-open` (enter transition guard)', () => {
    // The panel mounts off-screen (translateY(100%)). For the slide-up to
    // animate, the browser must commit that starting transform BEFORE `is-open`
    // (translateY(0)) is applied — otherwise the freshly-inserted node snaps
    // straight to the open position and pops in with no transition. The Sheet
    // guarantees this by reading the panel's layout (offsetHeight) to force a
    // synchronous reflow while `is-open` is still absent.
    //
    // We record, at each layout read of the `.sheet` panel, whether `is-open`
    // was present. A reflow observed while it is ABSENT proves the start style
    // is committed before the class flip. Instrumenting offsetHeight (rather
    // than hijacking rAF) keeps this fast and free of user-event side effects.
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!
    const openStateAtReads: boolean[] = []
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        if (this.classList?.contains('sheet')) {
          openStateAtReads.push(this.closest('.sheet-root')?.classList.contains('is-open') ?? false)
        }
        return 0
      },
    })

    try {
      const view = render(
        <Sheet open={false} onClose={() => {}} title="New workout day">
          <input aria-label="Workout day name" />
        </Sheet>,
      )
      view.rerender(
        <Sheet open onClose={() => {}} title="New workout day">
          <input aria-label="Workout day name" />
        </Sheet>,
      )
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', original)
    }

    // The panel's layout was read at least once while it was still off-screen
    // (before `is-open`), and it ends up on-screen. The old code never forced a
    // reflow, so this list would be empty (regression guard).
    expect(openStateAtReads).toContain(false)
    expect(screen.getByRole('presentation')).toHaveClass('is-open')
  })

  it('closes when the scrim is clicked', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'open' }))
    await screen.findByRole('dialog')

    // Two "Close" affordances (scrim + button); the scrim is first in the DOM.
    await userEvent.click(screen.getAllByRole('button', { name: 'Close' })[0])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('closes on Escape', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'open' }))
    await screen.findByRole('dialog')

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
