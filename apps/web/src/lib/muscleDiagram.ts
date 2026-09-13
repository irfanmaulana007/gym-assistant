// Muscle-group → anatome muscle-diagram mapping and URL builder (PRD 0009).
//
// The diagram is a pure function of data we already store on an Exercise
// (`primary_muscle_group` + `secondary_muscle_groups[]`). anatome's
// `generateImage` endpoint returns a standalone SVG colored by a `layers`
// parameter, so we only need to map our enum to anatome's muscle keys and
// compose the URL. No API change, no schema migration.
//
// If anatome's muscle vocabulary changes, only MUSCLE_GROUP_TO_ANATOME below
// changes — it is the single point of coupling to the external service.

import type { MuscleGroup } from '@/types/api'

// Layer colors — kept in hex-without-# form for anatome's `layers` param. These
// mirror the --muscle-primary / --muscle-secondary design tokens so the legend
// swatches and the SVG never drift.
export const PRIMARY_HEX = 'DC2626'
export const SECONDARY_HEX = 'F59E0B'
export const PRIMARY_COLOR = `#${PRIMARY_HEX}`
export const SECONDARY_COLOR = `#${SECONDARY_HEX}`

const DEFAULT_ANATOME_BASE_URL = 'https://api.anatome.dev'

export function anatomeBaseUrl(): string {
  return (import.meta.env.VITE_ANATOME_BASE_URL as string | undefined) ?? DEFAULT_ANATOME_BASE_URL
}

// Our enum → anatome layer key(s). Groups with no anatomical mapping
// (full_body / cardio / other) are intentionally absent — they fall back to the
// text badges (see PRD 0009 §4.4).
export const MUSCLE_GROUP_TO_ANATOME: Partial<Record<MuscleGroup, readonly string[]>> = {
  chest: ['chest'],
  back: ['upper-back', 'lower-back', 'trapezius'],
  shoulders: ['deltoids'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearm'],
  quads: ['quadriceps'],
  hamstrings: ['hamstring'],
  glutes: ['gluteal'],
  calves: ['calves'],
  core: ['abs', 'obliques'],
}

function anatomeKeysFor(group: MuscleGroup): readonly string[] {
  return MUSCLE_GROUP_TO_ANATOME[group] ?? []
}

// Insertion-order-preserving dedupe.
function unique(keys: string[]): string[] {
  return [...new Set(keys)]
}

// Build the anatome `layers` string from an exercise's muscle groups.
// Returns null when nothing maps (a pure cardio/full_body/other exercise) so
// callers can fall back to the text badges instead of rendering an empty body.
export function buildMuscleLayers(
  primary: MuscleGroup,
  secondary: readonly MuscleGroup[],
): string | null {
  const redKeys = unique([...anatomeKeysFor(primary)])
  const redSet = new Set(redKeys)

  // Primary wins: a key that is both primary and secondary renders red only.
  const amberKeys = unique(secondary.flatMap((g) => [...anatomeKeysFor(g)])).filter(
    (k) => !redSet.has(k),
  )

  if (redKeys.length === 0 && amberKeys.length === 0) return null

  const segments: string[] = []
  if (redKeys.length > 0) segments.push(`${PRIMARY_HEX}:${redKeys.join(',')}`)
  if (amberKeys.length > 0) segments.push(`${SECONDARY_HEX}:${amberKeys.join(',')}`)
  return segments.join('|')
}

// --- Muscle-usage diagram (PRD 0011) ---
//
// The profile diagram colors each muscle group by HOW MUCH it was trained, on a
// yellow → orange → red gradient relative to the user's own most-trained group.
// The tiers are ordered strongest-first; the most-trained group is always red.
// Hexes are kept in #-less form for anatome's `layers` param.
export const USAGE_TIER_HEXES = ['DC2626', 'F97316', 'F59E0B', 'FDE047'] as const

interface UsageTier {
  hex: string
  // A group qualifies for this tier when ratio (sets / maxSets) is strictly
  // greater than `min`. Ordered strongest-first so the first match wins.
  min: number
}

const USAGE_TIERS: readonly UsageTier[] = [
  { hex: 'DC2626', min: 0.75 }, // red — trained the most
  { hex: 'F97316', min: 0.5 }, // deep orange
  { hex: 'F59E0B', min: 0.25 }, // amber
  { hex: 'FDE047', min: 0 }, // yellow — trained the least (still > 0)
]

// One muscle group's training load. Structurally compatible with the analytics
// MuscleGroupStat (which carries extra fields we ignore here).
export interface MuscleUsageStat {
  muscle_group: string
  sets: number
}

function tierHexFor(ratio: number): string {
  // ratio is in (0, 1]; USAGE_TIERS ends at min:0 so a positive ratio always matches.
  return (USAGE_TIERS.find((t) => ratio > t.min) ?? USAGE_TIERS[USAGE_TIERS.length - 1]).hex
}

// Build the anatome `layers` string coloring each trained muscle group by its
// share of the user's most-trained group. Groups with no sets, or with no
// anatomical mapping (full_body / cardio / other), are skipped and render in the
// diagram's neutral body color. Returns null when nothing is trained/mappable so
// callers can show an empty state instead of a bare body with a misleading legend.
export function buildMuscleUsageLayers(stats: readonly MuscleUsageStat[]): string | null {
  const trained = stats.filter((s) => s.sets > 0 && anatomeKeysFor(s.muscle_group as MuscleGroup).length > 0)
  if (trained.length === 0) return null

  const max = Math.max(...trained.map((s) => s.sets))
  if (max <= 0) return null

  // Assign each anatome key to the strongest tier it earns across groups (a key
  // shared by two groups takes the higher intensity). Track order for stable output.
  const keyHex = new Map<string, string>()
  const tierRank = new Map<string, number>(USAGE_TIER_HEXES.map((hex, i) => [hex, i]))
  for (const s of trained) {
    const hex = tierHexFor(s.sets / max)
    for (const key of anatomeKeysFor(s.muscle_group as MuscleGroup)) {
      const current = keyHex.get(key)
      if (current == null || (tierRank.get(hex) ?? Infinity) < (tierRank.get(current) ?? Infinity)) {
        keyHex.set(key, hex)
      }
    }
  }

  // Group keys by color, emitting segments in tier order (red → yellow).
  const byHex = new Map<string, string[]>()
  for (const [key, hex] of keyHex) {
    const list = byHex.get(hex) ?? []
    list.push(key)
    byHex.set(hex, list)
  }

  const segments = USAGE_TIER_HEXES.filter((hex) => byHex.has(hex)).map(
    (hex) => `${hex}:${unique(byHex.get(hex) as string[]).join(',')}`,
  )
  return segments.length > 0 ? segments.join('|') : null
}

// Compose the anatome generateImage URL for a user's muscle-usage stats.
// Returns null when there is nothing to diagram (same signal as buildMuscleUsageLayers).
export function buildMuscleUsageDiagramUrl(
  stats: readonly MuscleUsageStat[],
  options: MuscleDiagramUrlOptions = {},
): string | null {
  const layers = buildMuscleUsageLayers(stats)
  if (layers == null) return null

  const { view = 'dual', baseUrl = anatomeBaseUrl() } = options
  const params = new URLSearchParams({ view, output: 'raw', layers })
  return `${baseUrl.replace(/\/$/, '')}/generateImage?${params.toString()}`
}

export interface MuscleDiagramUrlOptions {
  view?: 'dual' | 'front' | 'back'
  baseUrl?: string
}

// Compose the anatome generateImage URL for an exercise's muscle groups.
// Returns null when there is nothing to diagram (same signal as buildMuscleLayers).
export function buildMuscleDiagramUrl(
  primary: MuscleGroup,
  secondary: readonly MuscleGroup[],
  options: MuscleDiagramUrlOptions = {},
): string | null {
  const layers = buildMuscleLayers(primary, secondary)
  if (layers == null) return null

  const { view = 'dual', baseUrl = anatomeBaseUrl() } = options
  const params = new URLSearchParams({ view, output: 'raw', layers })
  return `${baseUrl.replace(/\/$/, '')}/generateImage?${params.toString()}`
}
