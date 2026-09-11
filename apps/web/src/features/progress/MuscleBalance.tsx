import { muscleGroupLabel, type MuscleGroupStat } from '@/types/api'

interface MuscleBalanceProps {
  groups: MuscleGroupStat[]
}

// Sets-per-muscle-group bars with undertrained groups flagged. The bar width is
// share-of-max sets so the busiest group fills the row (PRD §4.3, §6).
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
            <span className="muted small">{g.sets} sets · {g.frequency}×</span>
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
