// Small pure formatting helpers shared across screens.

import type { Exercise, WeightUnit } from '@/types/api'
import { convertWeight } from './units'

/** Format seconds as H:MM:SS (or MM:SS under an hour). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Human-readable target for an exercise, e.g. "4×8" or "30:00". */
export function formatTarget(measurementType: string, sets?: number | null, reps?: number | null, durationSeconds?: number | null): string {
  if (measurementType === 'duration' && durationSeconds != null) {
    return formatDuration(durationSeconds)
  }
  if (sets != null && reps != null) return `${sets}×${reps}`
  if (reps != null) return `${reps} reps`
  return '—'
}

/** Full target for the exercise detail view, e.g. "3×12 @ 40kg" / "30:00" / "5km". */
export function describeTarget(ex: Exercise): string {
  if (ex.measurement_type === 'duration') {
    return ex.target_duration_seconds != null ? formatDuration(ex.target_duration_seconds) : '—'
  }
  if (ex.measurement_type === 'distance') {
    return ex.target_distance != null ? `${ex.target_distance}${ex.distance_unit ?? ''}` : '—'
  }
  const base = formatTarget(ex.measurement_type, ex.target_sets, ex.target_reps)
  if (ex.measurement_type === 'weight_reps' && ex.target_weight != null && base !== '—') {
    return `${base} @ ${ex.target_weight}kg`
  }
  return base
}

/** The previous session's top set as "60kg × 8", or null when there's none.
 * When a preferred unit is given, the weight is converted from its stored unit
 * so history renders consistently in the user's unit (PRD 0008 §4.4). */
export function formatLastSet(
  last?: { weight: number; weight_unit: string; reps: number } | null,
  preferredUnit?: WeightUnit,
): string | null {
  if (!last) return null
  if (preferredUnit && (last.weight_unit === 'kg' || last.weight_unit === 'lb')) {
    const w = convertWeight(last.weight, last.weight_unit, preferredUnit)
    return `${w}${preferredUnit} × ${last.reps}`
  }
  return `${last.weight}${last.weight_unit} × ${last.reps}`
}

/** Short date like "Sep 2, 2026". */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
