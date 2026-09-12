import { describe, expect, it } from 'vitest'
import {
  buildMuscleDiagramUrl,
  buildMuscleLayers,
  MUSCLE_GROUP_TO_ANATOME,
  PRIMARY_HEX,
  SECONDARY_HEX,
} from '@/lib/muscleDiagram'
import { MUSCLE_GROUPS, type MuscleGroup } from '@/types/api'

// PRD 0009 — the muscle diagram is a pure function of an exercise's stored
// muscle groups. These lock the mapping + layers string so the URL we build for
// anatome is deterministic (same groups → same URL → effective caching).

describe('buildMuscleLayers', () => {
  it('builds a red primary + amber secondary layers string', () => {
    expect(buildMuscleLayers('chest', ['triceps', 'shoulders'])).toBe(
      `${PRIMARY_HEX}:chest|${SECONDARY_HEX}:triceps,deltoids`,
    )
  })

  it('expands back into the whole posterior chain', () => {
    expect(buildMuscleLayers('back', [])).toBe(`${PRIMARY_HEX}:upper-back,lower-back,trapezius`)
  })

  it('lets primary win — a group in both primary and secondary is red only', () => {
    // chest is both primary and secondary → chest stays red, never in the amber set.
    expect(buildMuscleLayers('chest', ['chest', 'triceps'])).toBe(
      `${PRIMARY_HEX}:chest|${SECONDARY_HEX}:triceps`,
    )
  })

  it('dedupes anatome keys within a color set', () => {
    // back and core both map to distinct keys; two secondaries sharing a key dedupe.
    // core → abs,obliques; passing core twice must not duplicate.
    expect(buildMuscleLayers('quads', ['core', 'core'])).toBe(
      `${PRIMARY_HEX}:quadriceps|${SECONDARY_HEX}:abs,obliques`,
    )
  })

  it('omits the primary segment when only secondaries map', () => {
    // primary "other" is unmapped, but a mappable secondary still produces amber.
    expect(buildMuscleLayers('other', ['chest'])).toBe(`${SECONDARY_HEX}:chest`)
  })

  it('signals no diagram for a fully unmapped exercise', () => {
    expect(buildMuscleLayers('cardio', [])).toBeNull()
    expect(buildMuscleLayers('full_body', ['other'])).toBeNull()
    expect(buildMuscleLayers('other', [])).toBeNull()
  })
})

describe('buildMuscleDiagramUrl', () => {
  it('composes an encoded generateImage URL with dual view and raw output', () => {
    const url = buildMuscleDiagramUrl('chest', ['triceps'], { baseUrl: 'https://anatome.test' })
    expect(url).not.toBeNull()
    const parsed = new URL(url as string)
    expect(parsed.origin + parsed.pathname).toBe('https://anatome.test/generateImage')
    expect(parsed.searchParams.get('view')).toBe('dual')
    expect(parsed.searchParams.get('output')).toBe('raw')
    // URLSearchParams decodes the layers so | and , round-trip correctly.
    expect(parsed.searchParams.get('layers')).toBe(`${PRIMARY_HEX}:chest|${SECONDARY_HEX}:triceps`)
  })

  it('strips a trailing slash on the base URL', () => {
    const url = buildMuscleDiagramUrl('chest', [], { baseUrl: 'https://anatome.test/' })
    expect(url?.startsWith('https://anatome.test/generateImage?')).toBe(true)
  })

  it('honors an explicit view', () => {
    const url = buildMuscleDiagramUrl('chest', [], { view: 'front', baseUrl: 'https://x.test' })
    expect(new URL(url as string).searchParams.get('view')).toBe('front')
  })

  it('returns null when there is nothing to diagram', () => {
    expect(buildMuscleDiagramUrl('cardio', [], { baseUrl: 'https://x.test' })).toBeNull()
  })
})

describe('MUSCLE_GROUP_TO_ANATOME coverage', () => {
  const UNMAPPED: MuscleGroup[] = ['full_body', 'cardio', 'other']

  it('maps every enum value except the three intentional fallbacks', () => {
    for (const g of MUSCLE_GROUPS) {
      const mapped = MUSCLE_GROUP_TO_ANATOME[g] != null
      expect(mapped).toBe(!UNMAPPED.includes(g))
    }
  })
})
