import { describe, expect, it } from 'vitest'
import { convertWeight, convertHeight, formatWeight, formatHeight } from '@/lib/units'

// Mirrors the API's pkg/units so both sides agree (PRD 0008 §4.4).
describe('unit conversion', () => {
  it('converts kg to lb and back, rounded to one decimal', () => {
    expect(convertWeight(100, 'kg', 'lb')).toBe(220.5)
    expect(convertWeight(220.5, 'lb', 'kg')).toBe(100)
    expect(convertWeight(60, 'kg', 'kg')).toBe(60)
  })

  it('converts cm to in and back, rounded to one decimal', () => {
    expect(convertHeight(180, 'cm', 'in')).toBe(70.9)
    expect(convertHeight(70.9, 'in', 'cm')).toBe(180.1)
    expect(convertHeight(175, 'cm', 'cm')).toBe(175)
  })

  it('formats a measurement in the target unit', () => {
    expect(formatWeight(100, 'kg', 'lb')).toBe('220.5lb')
    expect(formatHeight(180, 'cm', 'in')).toBe('70.9in')
    expect(formatWeight(60, 'kg', 'kg')).toBe('60kg')
  })
})
