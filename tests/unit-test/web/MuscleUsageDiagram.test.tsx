import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MuscleUsageDiagram } from '@/components/MuscleUsageDiagram'
import type { MuscleGroupStat } from '@/types/api'

// PRD 0011 — the profile muscle-usage diagram is additive on top of the data: it
// renders the anatome image + a Less→More legend when muscles are trained, and a
// quiet empty note when there is nothing to show or the image fails to load.

function stat(muscle_group: string, sets: number): MuscleGroupStat {
  return { muscle_group, sets, volume: 0, frequency: 0, undertrained: false }
}

describe('MuscleUsageDiagram', () => {
  it('renders the anatome image and a Less→More legend when muscles are trained', () => {
    render(<MuscleUsageDiagram groups={[stat('chest', 10), stat('biceps', 3)]} />)

    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', expect.stringContaining('/generateImage?'))
    expect(img.getAttribute('src')).toContain('layers=')
    expect(screen.getByText('Less')).toBeInTheDocument()
    expect(screen.getByText('More')).toBeInTheDocument()
  })

  it('shows an empty note when nothing is trained', () => {
    render(<MuscleUsageDiagram groups={[stat('chest', 0)]} />)
    expect(screen.getByText('No muscles trained in this window yet.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('falls back to the empty note when the image fails to load', () => {
    render(<MuscleUsageDiagram groups={[stat('chest', 10)]} />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByText('No muscles trained in this window yet.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
