import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Segmented } from '@/components/Segmented'
import { ErrorText, Spinner } from '@/components/ui'
import { ChevronRight } from '@/components/icons'
import { useDashboard } from '@/hooks/useDashboard'
import type { DashboardWindow, ExerciseTrend, Metric, PersonalRecord } from '@/types/api'
import { VolumeChart } from './VolumeChart'
import { MuscleBalance } from './MuscleBalance'
import { ActivityCalendar } from './ActivityCalendar'

const WINDOW_OPTIONS: { value: DashboardWindow; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: '3M' },
  { value: 'all', label: 'All' },
]

export function DashboardPage() {
  const [window, setWindow] = useState<DashboardWindow>('month')
  const { data, isLoading, isError } = useDashboard(window)

  const intro = (
    <div className="page-intro">
      <h2>Progress</h2>
      <p>Are you overloading, consistent, and in balance?</p>
    </div>
  )

  return (
    <Layout title="Progress" intro={intro} bottomNav>
      <Segmented options={WINDOW_OPTIONS} value={window} onChange={setWindow} ariaLabel="Time window" />

      {isLoading ? <Spinner /> : null}
      {isError ? <ErrorText>Could not load your progress.</ErrorText> : null}

      {data ? (
        data.summary.workouts.value === 0 && data.summary.longest_streak === 0 ? (
          <div className="empty">
            <span className="emoji">📊</span>
            No progress yet.
            <div className="small">Finish your first workout to see your progress here.</div>
          </div>
        ) : (
          <div className="stack">
            <SummaryTiles data={data.summary} unit={data.volume_unit} />

            <section className="stack">
              <div className="section-label">Volume trend ({data.volume_unit})</div>
              <div className="card">
                <VolumeChart points={data.volume_series} unit={data.volume_unit} bucket={data.window.bucket} />
              </div>
            </section>

            {data.trending_up.length > 0 || data.stalled.length > 0 ? (
              <section className="stack">
                <div className="section-label">Progress signals</div>
                {data.trending_up.length > 0 ? (
                  <ul className="list-grouped">
                    {data.trending_up.map((t) => (
                      <TrendRow key={t.exercise_id} trend={t} unit={data.volume_unit} kind="up" />
                    ))}
                  </ul>
                ) : null}
                {data.stalled.length > 0 ? (
                  <>
                    <div className="section-label">Needs a push ⚠️</div>
                    <ul className="list-grouped">
                      {data.stalled.map((t) => (
                        <TrendRow key={t.exercise_id} trend={t} unit={data.volume_unit} kind="stalled" />
                      ))}
                    </ul>
                  </>
                ) : null}
              </section>
            ) : null}

            {data.records.length > 0 ? (
              <section className="stack">
                <div className="section-label">Personal records</div>
                <ul className="list-grouped">
                  {data.records.map((r) => (
                    <RecordRow key={r.exercise_id} record={r} unit={data.volume_unit} />
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="stack">
              <div className="section-label">Muscle-group balance</div>
              <div className="card">
                <MuscleBalance groups={data.muscle_groups} />
              </div>
            </section>

            <section className="stack">
              <div className="section-label">Activity</div>
              <div className="card">
                <ActivityCalendar days={data.calendar} from={data.window.from} />
              </div>
            </section>
          </div>
        )
      ) : null}
    </Layout>
  )
}

function SummaryTiles({ data, unit }: { data: import('@/types/api').AnalyticsSummary; unit: string }) {
  return (
    <div className="stat-grid">
      <StatTile label="Workouts" metric={data.workouts} />
      <StatTile label="Training min" metric={data.training_minutes} />
      <StatTile label={`Volume (${unit})`} metric={data.total_volume} format={compact} />
      <div className="stat">
        <div className="stat-value">
          {data.current_streak}
          <span className="stat-unit"> wk</span>
        </div>
        <div className="stat-label">Streak · best {data.longest_streak}</div>
      </div>
      <div className="stat">
        <div className="stat-value">{data.days_since_last == null ? '—' : data.days_since_last}</div>
        <div className="stat-label">Days since last</div>
      </div>
    </div>
  )
}

function StatTile({ label, metric, format }: { label: string; metric: Metric; format?: (n: number) => string }) {
  const fmt = format ?? ((n: number) => Math.round(n).toLocaleString())
  return (
    <div className="stat">
      <div className="stat-value">{fmt(metric.value)}</div>
      <div className="stat-label">
        {label}
        {metric.delta_pct != null ? (
          <span className={`delta ${metric.delta_pct >= 0 ? 'delta-up' : 'delta-down'}`}>
            {' '}
            {metric.delta_pct >= 0 ? '▲' : '▼'} {Math.abs(metric.delta_pct)}%
          </span>
        ) : null}
      </div>
    </div>
  )
}

function TrendRow({ trend, unit, kind }: { trend: ExerciseTrend; unit: string; kind: 'up' | 'stalled' }) {
  return (
    <li>
      <Link className="nav-row" to={`/exercises/${trend.exercise_id}/history`}>
        <span className={kind === 'up' ? 'trend-mark trend-up' : 'trend-mark trend-flat'} aria-hidden>
          {kind === 'up' ? '▲' : '⚠️'}
        </span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row-title">{trend.name}</div>
          <div className="row-sub">
            {kind === 'up'
              ? `+${trend.change} ${unit} last session`
              : `No new high in ${trend.sessions} sessions`}
          </div>
        </div>
        <ChevronRight className="chevron" />
      </Link>
    </li>
  )
}

function RecordRow({ record, unit }: { record: PersonalRecord; unit: string }) {
  return (
    <li>
      <Link className="nav-row" to={`/exercises/${record.exercise_id}/history`}>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row-title row wrap" style={{ gap: 'var(--sp-2)' }}>
            <span>{record.name}</span>
            {record.is_new_this_window ? <span className="badge badge-active">New PR ✨</span> : null}
          </div>
          <div className="row-sub">
            {record.heaviest_weight}{unit} × {record.heaviest_reps} · est 1RM {record.est_one_rm}{unit}
          </div>
        </div>
        <ChevronRight className="chevron" />
      </Link>
    </li>
  )
}

function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(Math.round(n))
}
