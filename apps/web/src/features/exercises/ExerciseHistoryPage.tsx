import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { exercisesApi } from '@/api/routines'
import { Layout } from '@/components/Layout'
import { ErrorText, Spinner, Button } from '@/components/ui'
import { formatDate } from '@/lib/format'

const TREND_LABEL: Record<string, string> = {
  up: '▲ Improving',
  down: '▼ Down',
  flat: '▬ Holding',
  none: 'Not enough data yet',
}

export function ExerciseHistoryPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['exercise-history', id],
    queryFn: () => exercisesApi.history(id),
  })

  if (isLoading) return <Layout title="History"><Spinner /></Layout>
  if (isError || !data) return <Layout title="History"><ErrorText>Could not load history.</ErrorText></Layout>

  const { exercise, sessions, trend } = data

  return (
    <Layout title={exercise.name} action={<Button size="sm" variant="ghost" onClick={() => navigate(-1)}>Back</Button>}>
      <div className="card row-between">
        <div>
          <div className="small muted">Progression</div>
          <strong>{TREND_LABEL[trend.direction] ?? trend.direction}</strong>
        </div>
        {trend.direction === 'up' || trend.direction === 'down' ? (
          <div className="timer">
            {trend.change > 0 ? '+' : ''}
            {trend.change} kg
          </div>
        ) : null}
      </div>

      {sessions.length === 0 ? (
        <p className="muted center">No logged sessions yet. Log this exercise in a workout to see your history.</p>
      ) : (
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
              <div className="small muted">Volume {s.total_volume.toLocaleString()} · {s.sets.length} sets</div>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  )
}
