// Small pure formatting helpers shared across screens.

import type { Exercise } from '@/types/api'

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

/** The previous session's top set as "60kg × 8", or null when there's none. */
export function formatLastSet(last?: { weight: number; weight_unit: string; reps: number } | null): string | null {
  if (!last) return null
  return `${last.weight}${last.weight_unit} × ${last.reps}`
}

/** Short date like "Sep 2, 2026". */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
