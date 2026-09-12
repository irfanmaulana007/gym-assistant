// Pure weight/height unit conversions + formatting, mirroring the API's
// pkg/units. Measurements are stored value+unit per row (PRD 0008); the app
// renders everything in the user's preferred unit, converting rows stored in a
// different unit at display time. Stored values are never rounded — only the
// displayed conversion is.

import type { WeightUnit, HeightUnit } from '@/types/api'

export const LB_PER_KG = 2.2046226
export const CM_PER_IN = 2.54

/** Round to one decimal — the display precision for converted measurements. */
function round1(v: number): number {
  return Math.round(v * 10) / 10
}

/** Convert a weight between kg/lb, rounded to one decimal. */
export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value
  if (from === 'kg' && to === 'lb') return round1(value * LB_PER_KG)
  if (from === 'lb' && to === 'kg') return round1(value / LB_PER_KG)
  return value
}

/** Convert a height between cm/in, rounded to one decimal. */
export function convertHeight(value: number, from: HeightUnit, to: HeightUnit): number {
  if (from === to) return value
  if (from === 'cm' && to === 'in') return round1(value / CM_PER_IN)
  if (from === 'in' && to === 'cm') return round1(value * CM_PER_IN)
  return value
}

/** Format a weight in the target unit, converting from its stored unit. */
export function formatWeight(value: number, from: WeightUnit, to: WeightUnit): string {
  return `${convertWeight(value, from, to)}${to}`
}

/** Format a height in the target unit, converting from its stored unit. */
export function formatHeight(value: number, from: HeightUnit, to: HeightUnit): string {
  return `${convertHeight(value, from, to)}${to}`
}
