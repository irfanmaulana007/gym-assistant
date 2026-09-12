import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MuscleDiagram } from '@/components/MuscleDiagram'
import { PRIMARY_HEX, SECONDARY_HEX } from '@/lib/muscleDiagram'

// PRD 0009 — the diagram is additive on top of the text badges. It renders an
// anatome <img> when the muscle groups map, renders nothing when they don't, and
// silently hides the image on load failure so a broken-image icon never appears.

describe('MuscleDiagram', () => {
  it('renders an anatome <img> with the correctly encoded layers URL', () => {
    render(<MuscleDiagram primary="chest" secondary={['triceps', 'shoulders']} />)
    const img = screen.getByRole('img')
    const src = img.getAttribute('src') as string
    const layers = new URL(src).searchParams.get('layers')
    expect(src).toContain('/generateImage?')
    expect(layers).toBe(`${PRIMARY_HEX}:chest|${SECONDARY_HEX}:triceps,deltoids`)
  })

  it('describes the worked muscles in the alt text', () => {
    render(<MuscleDiagram primary="chest" secondary={['triceps', 'shoulders']} />)
    expect(screen.getByRole('img')).toHaveAttribute(
      'alt',
      'Muscles worked: chest (primary), triceps and shoulders (secondary)',
    )
  })

  it('shows a Primary/Secondary legend', () => {
    render(<MuscleDiagram primary="chest" secondary={['triceps']} />)
    expect(screen.getByText('Primary')).toBeInTheDocument()
    expect(screen.getByText('Secondary')).toBeInTheDocument()
  })

  it('omits the Secondary legend when there are no secondaries', () => {
    render(<MuscleDiagram primary="chest" secondary={[]} />)
    expect(screen.getByText('Primary')).toBeInTheDocument()
    expect(screen.queryByText('Secondary')).not.toBeInTheDocument()
  })

  it('renders nothing (badges-only) for an unmapped exercise', () => {
    const { container } = render(<MuscleDiagram primary="cardio" secondary={[]} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('hides the image on load error so no broken-image icon shows', () => {
    const { container } = render(<MuscleDiagram primary="chest" secondary={[]} />)
    fireEvent.error(screen.getByRole('img'))
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
