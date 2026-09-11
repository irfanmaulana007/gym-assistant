import type { VolumePoint } from '@/types/api'

interface VolumeChartProps {
  points: VolumePoint[]
  unit: string
  bucket: string
}

// Compact, dependency-free bar chart for the volume trend. One accessible
// series built from design tokens; scrolls horizontally when there are many
// buckets (PRD §6, dataviz guidance).
export function VolumeChart({ points, unit, bucket }: VolumeChartProps) {
  if (points.length === 0) {
    return <p className="muted small" style={{ margin: 0 }}>No volume logged in this window yet.</p>
  }
  const max = Math.max(...points.map((p) => p.volume), 1)
  const summary = `Volume by ${bucket} in ${unit}: ` +
    points.map((p) => `${labelFor(p.bucket_start, bucket)} ${Math.round(p.volume)}`).join(', ')

  return (
    <div className="chart-scroll">
      <div className="bar-chart" role="img" aria-label={summary}>
        {points.map((p) => {
          const pct = Math.max((p.volume / max) * 100, p.volume > 0 ? 4 : 0)
          return (
            <div className="bar-col" key={p.bucket_start} title={`${Math.round(p.volume)} ${unit}`}>
              <span className="bar-value">{compact(p.volume)}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ height: `${pct}%` }} />
              </div>
              <span className="bar-label">{labelFor(p.bucket_start, bucket)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function labelFor(iso: string, bucket: string): string {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1, d ?? 1)
  if (bucket === 'month') return date.toLocaleDateString(undefined, { month: 'short' })
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(Math.round(n))
}
