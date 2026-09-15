import { formatDuration } from '@/lib/format'
import { muscleGroupLabel, type MuscleGroupStat } from '@/types/api'

interface MuscleBalanceProps {
  groups: MuscleGroupStat[]
}

// Cardio is time-based, not set-based, so its coverage reads better as total
// duration plus how many cardio bouts were logged rather than a "sets" count.
function metricLabel(g: MuscleGroupStat): string {
  if (g.muscle_group === 'cardio') {
    const bouts = `${g.sets} cardio`
    return g.duration_seconds > 0 ? `${formatDuration(g.duration_seconds)} · ${bouts}` : bouts
  }
  return `${g.sets} sets · ${g.frequency}×`
}

// Sets-per-muscle-group bars with undertrained groups flagged. The bar width is
// share-of-max sets so the busiest group fills the row (PRD §4.3, §6). Cardio is
// summarized by duration instead of sets since it's timed, not rep-based work.
export function MuscleBalance({ groups }: MuscleBalanceProps) {
  if (groups.length === 0) {
    return <p className="muted small" style={{ margin: 0 }}>No muscle groups trained in this window yet.</p>
  }
  const max = Math.max(...groups.map((g) => g.sets), 1)
  return (
    <ul className="muscle-bars">
      {groups.map((g) => (
        <li key={g.muscle_group} className="muscle-bar-row">
          <div className="row-between">
            <span>
              {muscleGroupLabel(g.muscle_group)}
              {g.undertrained ? <span className="badge badge-warn" style={{ marginLeft: 'var(--sp-2)' }}>Low</span> : null}
            </span>
            <span className="muted small">{metricLabel(g)}</span>
          </div>
          <div className="muscle-bar-track">
            <div
              className={`muscle-bar-fill${g.undertrained ? ' is-undertrained' : ''}`}
              style={{ width: `${Math.max((g.sets / max) * 100, 3)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
