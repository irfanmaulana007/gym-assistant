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
    <div className="stack">
      <div className="card stack">
        <div className="row-between">
          <span className="muted">Active time</span>
          <strong>{formatDuration(session.active_duration_seconds ?? 0)}</strong>
        </div>
        <div className="row-between">
          <span className="muted">Total time</span>
          <strong>{formatDuration(session.total_duration_seconds ?? 0)}</strong>
        </div>
        <div className="row-between">
          <span className="muted">Rested</span>
          <strong>{formatDuration(session.paused_duration_seconds ?? 0)}</strong>
        </div>
        <div className="row-between">
          <span className="muted">Sets logged</span>
          <strong>{totalSets}</strong>
        </div>
        <div className="row-between">
          <span className="muted">Total volume</span>
          <strong>{totalVolume.toLocaleString()} kg</strong>
        </div>
        {timedSeconds > 0 ? (
          <div className="row-between">
            <span className="muted">Timed work</span>
            <strong>{formatDuration(timedSeconds)}</strong>
          </div>
        ) : null}
      </div>

      <div className="card stack">
        <strong>Muscle groups worked</strong>
        <div className="row" style={{ flexWrap: 'wrap' }}>
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
        <strong>Exercises</strong>
        <ul className="stack small" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {exercises.map((e) => (
            <li key={e.id} className="row-between">
              <span>{e.name_snapshot}</span>
              <span className="muted">
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
