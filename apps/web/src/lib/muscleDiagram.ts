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
