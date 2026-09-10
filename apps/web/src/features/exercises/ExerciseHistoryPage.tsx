import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { exercisesApi } from '@/api/routines'
import { Layout } from '@/components/Layout'
import { ErrorText, Spinner } from '@/components/ui'
import { formatDate } from '@/lib/format'

const TREND_LABEL: Record<string, string> = {
  up: '▲ Improving',
  down: '▼ Down',
  flat: '▬ Holding',
  none: 'Not enough data yet',
}

export function ExerciseHistoryPage() {
  const { id = '' } = useParams()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['exercise-history', id],
    queryFn: () => exercisesApi.history(id),
  })

  if (isLoading) return <Layout title="History" back={-1}><Spinner /></Layout>
  if (isError || !data) return <Layout title="History" back={-1}><ErrorText>Could not load history.</ErrorText></Layout>

  const { exercise, sessions, trend } = data
  const showChange = trend.direction === 'up' || trend.direction === 'down'

  return (
    <Layout title={exercise.name} back={-1}>
      <div className="card row-between">
        <div>
          <div className="section-label" style={{ padding: 0 }}>Progression</div>
          <strong style={{ fontSize: 18 }}>{TREND_LABEL[trend.direction] ?? trend.direction}</strong>
        </div>
        {showChange ? (
          <div className="timer" style={{ color: trend.direction === 'up' ? 'var(--primary)' : 'var(--danger)' }}>
            {trend.change > 0 ? '+' : ''}
            {trend.change} kg
          </div>
        ) : null}
      </div>

      {sessions.length === 0 ? (
        <div className="empty">
          <span className="emoji">📈</span>
          No logged sessions yet.
          <div className="small">Log this exercise in a workout to see your history.</div>
        </div>
      ) : (
        <>
          <div className="section-label">History</div>
          <ul className="list">
            {[...sessions].reverse().map((s) => (
              <li key={s.session_id} className="list-item">
                <div className="row-between">
                  <span className="muted">{formatDate(s.performed_at)}</span>
                  {s.top_set ? (
                    <strong>
                      {s.top_set.weight}
                      {s.top_set.weight_unit} × {s.top_set.reps}
                    </strong>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>
                <div className="row-sub">Volume {s.total_volume.toLocaleString()} · {s.sets.length} sets</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Layout>
  )
}
