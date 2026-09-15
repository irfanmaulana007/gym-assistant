import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MuscleBalance } from '@/features/progress/MuscleBalance'
import type { MuscleGroupStat } from '@/types/api'

function stat(overrides: Partial<MuscleGroupStat> & Pick<MuscleGroupStat, 'muscle_group'>): MuscleGroupStat {
  return { sets: 0, volume: 0, frequency: 0, undertrained: false, duration_seconds: 0, ...overrides }
}

describe('MuscleBalance', () => {
  it('shows sets and frequency for strength groups', () => {
    render(<MuscleBalance groups={[stat({ muscle_group: 'chest', sets: 16, frequency: 2 })]} />)
    expect(screen.getByText('16 sets · 2×')).toBeInTheDocument()
    expect(screen.getByText('Chest')).toBeInTheDocument()
  })

  it('shows total duration and how many cardio bouts for cardio instead of sets', () => {
    // 1500s = 25:00 across 3 logged cardio bouts.
    render(<MuscleBalance groups={[stat({ muscle_group: 'cardio', sets: 3, frequency: 2, duration_seconds: 1500 })]} />)
    expect(screen.getByText('25:00 · 3 cardio')).toBeInTheDocument()
    // The old "sets" phrasing must be gone for cardio.
    expect(screen.queryByText(/\bsets\b/)).not.toBeInTheDocument()
  })

  it('falls back to the cardio count alone when no duration was logged', () => {
    render(<MuscleBalance groups={[stat({ muscle_group: 'cardio', sets: 2, duration_seconds: 0 })]} />)
    expect(screen.getByText('2 cardio')).toBeInTheDocument()
  })

  it('renders an empty note when nothing was trained', () => {
    render(<MuscleBalance groups={[]} />)
    expect(screen.getByText(/No muscle groups trained/i)).toBeInTheDocument()
  })
})
