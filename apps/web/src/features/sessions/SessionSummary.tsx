import { Link } from 'react-router-dom'
import { formatDuration } from '@/lib/format'
import type { WorkoutSession } from '@/types/api'

// Post-workout summary — the same shape a future dashboard card will use
// (PRD 0002 §8).
export function SessionSummary({ session }: { session: WorkoutSession }) {
  const exercises = session.exercises ?? []
  const totalSets = exercises.reduce((n, e) => n + (e.sets_completed ?? 0), 0)
  const totalVolume = exercises.reduce((n, e) => n + (e.total_volume ?? 0), 0)
  const timedSeconds = exercises.reduce((n, e) => n + (e.total_duration_seconds ?? 0), 0)

  return (
    <div className="stack" style={{ gap: 'var(--sp-4)' }}>
      <div className="page-intro center">
        <h2>Nice work! 🎉</h2>
        <p>Here's how your session went.</p>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-value">{formatDuration(session.active_duration_seconds ?? 0)}</div>
          <div className="stat-label">Active time</div>
        </div>
        <div className="stat">
          <div className="stat-value">{formatDuration(session.total_duration_seconds ?? 0)}</div>
          <div className="stat-label">Total time</div>
        </div>
        <div className="stat">
          <div className="stat-value">{totalSets}</div>
          <div className="stat-label">Sets logged</div>
        </div>
        <div className="stat">
          <div className="stat-value">{totalVolume.toLocaleString()}<span className="small muted"> kg</span></div>
          <div className="stat-label">Total volume</div>
        </div>
        {timedSeconds > 0 ? (
          <div className="stat">
            <div className="stat-value">{formatDuration(timedSeconds)}</div>
            <div className="stat-label">Timed work</div>
          </div>
        ) : null}
        <div className="stat">
          <div className="stat-value">{formatDuration(session.paused_duration_seconds ?? 0)}</div>
          <div className="stat-label">Rested</div>
        </div>
      </div>

      <div className="card stack">
        <div className="section-label">Muscle groups worked</div>
        <div className="row wrap">
          {session.muscle_groups.length > 0 ? (
            session.muscle_groups.map((g) => (
              <span key={g} className="badge badge-active">{g}</span>
            ))
          ) : (
            <span className="muted">—</span>
          )}
        </div>
      </div>

      <div className="card stack">
        <div className="section-label">Exercises</div>
        <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {exercises.map((e) => (
            <li key={e.id} className="row-between">
              <span>{e.name_snapshot}</span>
              <span className="muted small">
                {e.sets_completed} set{e.sets_completed === 1 ? '' : 's'}
                {e.top_set_weight != null ? ` · top ${e.top_set_weight}kg` : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Link to="/" className="btn btn-primary btn-block">Done</Link>
    </div>
  )
}
