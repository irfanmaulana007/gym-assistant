// Small pure formatting helpers shared across screens.

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

/** Short date like "Sep 2, 2026". */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
