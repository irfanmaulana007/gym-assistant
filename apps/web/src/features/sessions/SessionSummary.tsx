import { Link } from 'react-router-dom'
import { formatDuration } from '@/lib/format'
import { sessionMuscleUsage } from '@/lib/sessionMuscles'
import { MuscleUsageDiagram } from '@/components/MuscleUsageDiagram'
import { Collapsible } from '@/components/Collapsible'
import { muscleGroupLabel, type SessionExercise, type WorkoutSession } from '@/types/api'

// Post-workout summary — the same shape a future dashboard card will use
// (PRD 0002 §8). Shown both right after finishing and when reopening a past
// session from the History tab (PRD 0013).
export function SessionSummary({ session }: { session: WorkoutSession }) {
  const exercises = session.exercises ?? []
  const totalSets = exercises.reduce((n, e) => n + (e.sets_completed ?? 0), 0)
  const totalVolume = exercises.reduce((n, e) => n + (e.total_volume ?? 0), 0)
  const timedSeconds = exercises.reduce((n, e) => n + (e.total_duration_seconds ?? 0), 0)
  const muscleUsage = sessionMuscleUsage(session)

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
        <MuscleUsageDiagram groups={muscleUsage} />
        <div className="row wrap">
          {session.muscle_groups.length > 0 ? (
            session.muscle_groups.map((g) => (
              <span key={g} className="badge badge-active">{muscleGroupLabel(g)}</span>
            ))
          ) : (
            <span className="muted">—</span>
          )}
        </div>
      </div>

      <div className="card stack">
        <div className="section-label">Exercises</div>
        <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 'var(--sp-3)' }}>
          {exercises.map((e) => (
            <li key={e.id}>
              <SummaryExerciseRow exercise={e} />
            </li>
          ))}
        </ul>
      </div>

      <Link to="/workout" className="btn btn-primary btn-block">Done</Link>
    </div>
  )
}

// One exercise in the summary. Collapsed it reads as a single line
// (name · sets · top set); expanded it reveals every logged set so weights and
// reps that varied set-to-set are visible. Exercises with no logged sets stay
// as a plain, non-interactive row.
function SummaryExerciseRow({ exercise }: { exercise: SessionExercise }) {
  const entries = exercise.entries ?? []
  const summary = (
    <span className="row-between" style={{ gap: 'var(--sp-3)' }}>
      <span className="grow">{exercise.name_snapshot}</span>
      <span className="muted small">
        {exercise.sets_completed} set{exercise.sets_completed === 1 ? '' : 's'}
        {exercise.top_set_weight != null ? ` · top ${exercise.top_set_weight}kg` : ''}
      </span>
    </span>
  )

  if (entries.length === 0) {
    // No sets to reveal — align with the expandable rows by matching the
    // chevron's width so names line up.
    return <span style={{ paddingLeft: 'calc(20px + var(--sp-2))', display: 'block' }}>{summary}</span>
  }

  return (
    <Collapsible ariaLabel={`Show sets for ${exercise.name_snapshot}`} summary={summary}>
      {entries.map((entry) => (
        <div key={entry.id} className="entry-row">
          <span className="idx">Set {entry.entry_number}</span>
          <span className="val">
            {entry.duration_seconds != null
              ? formatDuration(entry.duration_seconds)
              : `${entry.weight ?? '—'}${entry.weight_unit ?? ''} × ${entry.reps ?? '—'}`}
          </span>
        </div>
      ))}
    </Collapsible>
  )
}
