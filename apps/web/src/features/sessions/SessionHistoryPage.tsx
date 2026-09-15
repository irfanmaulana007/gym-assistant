import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { sessionsApi } from '@/api/sessions'
import { Layout } from '@/components/Layout'
import { ErrorText, Spinner } from '@/components/ui'
import { ChevronRight } from '@/components/icons'
import { formatDate, formatDuration } from '@/lib/format'
import { muscleGroupLabel, type WorkoutSession } from '@/types/api'

// Browsable history of completed workouts (PRD 0012). Each row opens the same
// summary shown right after finishing (`/sessions/:id`). The list endpoint
// returns session-level facts only (date, durations, muscle groups) — the full
// per-exercise breakdown and body heatmap live on the detail.
export function SessionHistoryPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessionsApi.list(50),
  })

  const intro = (
    <div className="page-intro">
      <h2>History</h2>
      <p>Every workout you've finished — tap one to see its summary.</p>
    </div>
  )

  const completed = (data ?? [])
    .filter((s) => s.status === 'completed')
    .sort((a, b) => b.performed_at.localeCompare(a.performed_at))

  return (
    <Layout title="History" intro={intro} bottomNav>
      {isLoading ? <Spinner /> : null}
      {isError ? <ErrorText>Could not load your workout history.</ErrorText> : null}

      {data ? (
        completed.length === 0 ? (
          <div className="empty">
            <span className="emoji">📅</span>
            No workouts yet.
            <div className="small">Finish a workout to see it here.</div>
          </div>
        ) : (
          <ul className="list-grouped">
            {completed.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </ul>
        )
      ) : null}
    </Layout>
  )
}

function SessionRow({ session }: { session: WorkoutSession }) {
  return (
    <li>
      <Link className="nav-row" to={`/sessions/${session.id}`}>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row-title">{formatDate(session.performed_at)}</div>
          <div className="row-sub row wrap" style={{ gap: 'var(--sp-2)' }}>
            <span className="muted">{formatDuration(session.active_duration_seconds ?? 0)} active</span>
            {session.muscle_groups.slice(0, 4).map((g) => (
              <span key={g} className="badge">{muscleGroupLabel(g)}</span>
            ))}
            {session.muscle_groups.length > 4 ? (
              <span className="muted small">+{session.muscle_groups.length - 4}</span>
            ) : null}
          </div>
        </div>
        <ChevronRight className="chevron" />
      </Link>
    </li>
  )
}
