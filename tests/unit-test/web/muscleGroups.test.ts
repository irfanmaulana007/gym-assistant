import { describe, expect, it } from 'vitest'
import { MUSCLE_GROUPS, MUSCLE_GROUP_SECTIONS, muscleGroupLabel } from '@/types/api'

describe('MUSCLE_GROUP_SECTIONS', () => {
  it('groups muscle groups under body-area sections', () => {
    expect(MUSCLE_GROUP_SECTIONS.map((s) => s.label)).toEqual([
      'Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Other',
    ])
    const arms = MUSCLE_GROUP_SECTIONS.find((s) => s.label === 'Arms')
    expect(arms?.groups).toEqual(['biceps', 'triceps', 'forearms'])
    const legs = MUSCLE_GROUP_SECTIONS.find((s) => s.label === 'Legs')
    expect(legs?.groups).toEqual(['quads', 'hamstrings', 'glutes', 'calves'])
  })

  it('derives the flat MUSCLE_GROUPS list from the sections without loss', () => {
    const flattened = MUSCLE_GROUP_SECTIONS.flatMap((s) => s.groups)
    expect(MUSCLE_GROUPS).toEqual(flattened)
    // Every original value is still present exactly once.
    expect(new Set(MUSCLE_GROUPS).size).toBe(MUSCLE_GROUPS.length)
    expect(MUSCLE_GROUPS).toEqual(
      expect.arrayContaining([
        'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
        'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body',
        'cardio', 'other',
      ]),
    )
    expect(MUSCLE_GROUPS).toHaveLength(14)
  })
})

describe('muscleGroupLabel', () => {
  it('capitalizes a single-word muscle group instead of showing raw lowercase', () => {
    expect(muscleGroupLabel('chest')).toBe('Chest')
    expect(muscleGroupLabel('biceps')).toBe('Biceps')
  })

  it('drops snake_case underscores and capitalizes the first word', () => {
    expect(muscleGroupLabel('full_body')).toBe('Full body')
  })

  it('produces a human-readable label for every muscle group value', () => {
    for (const g of MUSCLE_GROUPS) {
      const label = muscleGroupLabel(g)
      expect(label).not.toContain('_')
      expect(label[0]).toBe(label[0].toUpperCase())
    }
  })
})
