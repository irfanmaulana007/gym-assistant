import { describe, expect, it } from 'vitest'
import {
  buildMuscleUsageDiagramUrl,
  buildMuscleUsageLayers,
  USAGE_TIER_HEXES,
  type MuscleUsageStat,
} from '@/lib/muscleDiagram'

// PRD 0010 — the profile muscle-usage diagram colors each group by its share of
// the user's most-trained group (sets), on a yellow → orange → red gradient.
// These lock the tier bucketing and the layers string so the anatome URL is
// deterministic.

const [RED, DEEP_ORANGE, AMBER, YELLOW] = USAGE_TIER_HEXES

describe('buildMuscleUsageLayers', () => {
  it('paints the most-trained group red and scales the rest relative to it', () => {
    // chest 20 (max → red), back 12 (0.6 → deep orange), biceps 8 (0.4 → amber),
    // calves 2 (0.1 → yellow).
    const stats: MuscleUsageStat[] = [
      { muscle_group: 'chest', sets: 20 },
      { muscle_group: 'back', sets: 12 },
      { muscle_group: 'biceps', sets: 8 },
      { muscle_group: 'calves', sets: 2 },
    ]
    expect(buildMuscleUsageLayers(stats)).toBe(
      `${RED}:chest|${DEEP_ORANGE}:upper-back,lower-back,trapezius|${AMBER}:biceps|${YELLOW}:calves`,
    )
  })

  it('puts a lone trained group in the top (red) tier', () => {
    expect(buildMuscleUsageLayers([{ muscle_group: 'chest', sets: 5 }])).toBe(`${RED}:chest`)
  })

  it('skips groups with zero sets', () => {
    const stats: MuscleUsageStat[] = [
      { muscle_group: 'chest', sets: 10 },
      { muscle_group: 'quads', sets: 0 },
    ]
    expect(buildMuscleUsageLayers(stats)).toBe(`${RED}:chest`)
  })

  it('skips groups with no anatomical mapping (full_body / cardio / other)', () => {
    const stats: MuscleUsageStat[] = [
      { muscle_group: 'chest', sets: 10 },
      { muscle_group: 'cardio', sets: 30 }, // higher sets but unmapped → ignored, not the max
      { muscle_group: 'full_body', sets: 5 },
      { muscle_group: 'other', sets: 5 },
    ]
    // chest is the only mapped group → it is the max → red.
    expect(buildMuscleUsageLayers(stats)).toBe(`${RED}:chest`)
  })

  it('returns null when nothing is trained or mappable', () => {
    expect(buildMuscleUsageLayers([])).toBeNull()
    expect(buildMuscleUsageLayers([{ muscle_group: 'chest', sets: 0 }])).toBeNull()
    expect(buildMuscleUsageLayers([{ muscle_group: 'cardio', sets: 50 }])).toBeNull()
  })

  it('uses the boundary rule ratio > min (an exact 0.75 share is not red)', () => {
    // chest 4 (max → red), back 3 (ratio 0.75 → NOT red, falls to deep orange).
    const stats: MuscleUsageStat[] = [
      { muscle_group: 'chest', sets: 4 },
      { muscle_group: 'back', sets: 3 },
    ]
    expect(buildMuscleUsageLayers(stats)).toBe(
      `${RED}:chest|${DEEP_ORANGE}:upper-back,lower-back,trapezius`,
    )
  })
})

describe('buildMuscleUsageDiagramUrl', () => {
  it('composes an encoded generateImage URL with dual view and raw output', () => {
    const url = buildMuscleUsageDiagramUrl(
      [
        { muscle_group: 'chest', sets: 10 },
        { muscle_group: 'biceps', sets: 3 },
      ],
      { baseUrl: 'https://anatome.test' },
    )
    expect(url).not.toBeNull()
    const parsed = new URL(url as string)
    expect(parsed.origin + parsed.pathname).toBe('https://anatome.test/generateImage')
    expect(parsed.searchParams.get('view')).toBe('dual')
    expect(parsed.searchParams.get('output')).toBe('raw')
    expect(parsed.searchParams.get('layers')).toBe(`${RED}:chest|${AMBER}:biceps`)
  })

  it('returns null when there is nothing to diagram', () => {
    expect(buildMuscleUsageDiagramUrl([], { baseUrl: 'https://x.test' })).toBeNull()
  })
})
