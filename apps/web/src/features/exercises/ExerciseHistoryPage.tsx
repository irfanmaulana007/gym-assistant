import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { exercisesApi, type ExerciseInput } from '@/api/routines'
import { Layout } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Segmented } from '@/components/Segmented'
import { Button, ErrorText, Spinner } from '@/components/ui'
import { MuscleDiagram } from '@/components/MuscleDiagram'
import { PencilIcon } from '@/components/icons'
import { EMPTY_EXERCISE_FORM, ExerciseFormFields, MEASUREMENT_LABELS, exerciseToInput, normalizeExerciseInput } from './ExerciseForm'
import { muscleGroupLabel } from '@/types/api'
import { describeTarget, formatDate } from '@/lib/format'
import { ApiError } from '@/api/client'

const TREND_LABEL: Record<string, string> = {
  up: '▲ Improving',
  down: '▼ Down',
  flat: '▬ Holding',
  none: 'Not enough data yet',
}

type DetailTab = 'info' | 'progress' | 'history'

const TABS: { value: DetailTab; label: string }[] = [
  { value: 'info', label: 'Info' },
  { value: 'progress', label: 'Progress' },
  { value: 'history', label: 'History' },
]

export function ExerciseHistoryPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['exercise-history', id],
    queryFn: () => exercisesApi.history(id),
  })

  const [tab, setTab] = useState<DetailTab>('info')
  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState<ExerciseInput>(EMPTY_EXERCISE_FORM)
  const [linked, setLinked] = useState(false)
  const [error, setError] = useState('')

  const routineId = data?.exercise.routine_id
  const wasLinked = data?.exercise.catalog_exercise_id != null

  const openEdit = () => {
    if (data) setForm(exerciseToInput(data.exercise))
    setLinked(wasLinked)
    setError('')
    setEditOpen(true)
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['exercise-history', id] })
    if (routineId) qc.invalidateQueries({ queryKey: ['routine', routineId] })
  }

  const updateMut = useMutation({
    mutationFn: (input: ExerciseInput) => exercisesApi.update(id, input),
    onSuccess: () => {
      setEditOpen(false)
      invalidate()
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not save changes'),
  })

  const deleteMut = useMutation({
    mutationFn: () => exercisesApi.remove(id),
    onSuccess: () => {
      if (routineId) {
        qc.invalidateQueries({ queryKey: ['routine', routineId] })
        navigate(`/routines/${routineId}`)
      } else {
        navigate('/workout')
      }
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not delete exercise'),
  })

  function onSave(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name?.trim()) {
      setError('Exercise name is required')
      return
    }
    const normalized = normalizeExerciseInput(form)
    if (linked) {
      // Still catalog-linked: send name/targets only — muscle groups and the
      // link stay resolved from the catalog (omitting catalog_exercise_id
      // leaves the link unchanged).
      const { primary_muscle_group: _p, secondary_muscle_groups: _s, ...rest } = normalized
      void _p
      void _s
      updateMut.mutate(rest)
    } else if (wasLinked) {
      // User chose "make custom": unlink and adopt the edited muscle group.
      updateMut.mutate({ ...normalized, catalog_exercise_id: null })
    } else {
      updateMut.mutate(normalized)
    }
  }

  if (isLoading) return <Layout title="History" back={-1}><Spinner /></Layout>
  if (isError || !data) return <Layout title="History" back={-1}><ErrorText>Could not load history.</ErrorText></Layout>

  const { exercise, sessions, trend } = data
  const showChange = trend.direction === 'up' || trend.direction === 'down'

  return (
    <Layout title={exercise.name} back={-1}>
      <div className="detail-actions">
        <Button type="button" size="sm" variant="ghost" aria-label="Edit exercise" onClick={openEdit}>
          <PencilIcon />
          Edit
        </Button>
      </div>

      <Segmented options={TABS} value={tab} onChange={setTab} ariaLabel="Exercise detail sections" />

      {tab === 'info' ? (
        <div className="stack" role="tabpanel" aria-label="Info">
          <div className="section-label">Muscles worked</div>
          <div className="card stack">
            <MuscleDiagram
              primary={exercise.primary_muscle_group}
              secondary={exercise.secondary_muscle_groups}
            />
            <div className="row wrap" style={{ gap: 'var(--sp-2)' }}>
              <span className="badge badge-active">{muscleGroupLabel(exercise.primary_muscle_group)}</span>
              {exercise.secondary_muscle_groups.map((g) => (
                <span key={g} className="badge">{muscleGroupLabel(g)}</span>
              ))}
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              Primary
              {exercise.secondary_muscle_groups.length > 0 ? ' · secondary' : ''}
            </p>
          </div>

          <div className="section-label">Details</div>
          <ul className="list-grouped">
            <li className="detail-row">
              <span className="detail-label">Measurement</span>
              <span className="detail-value">{MEASUREMENT_LABELS[exercise.measurement_type]}</span>
            </li>
            <li className="detail-row">
              <span className="detail-label">Target</span>
              <span className="detail-value">{describeTarget(exercise)}</span>
            </li>
            <li className="detail-row">
              <span className="detail-label">Source</span>
              <span className="detail-value">
                {exercise.catalog_exercise_id != null
                  ? `Catalog${exercise.catalog_name ? `: ${exercise.catalog_name}` : ''}`
                  : 'Custom'}
              </span>
            </li>
          </ul>

          {exercise.notes.trim() ? (
            <>
              <div className="section-label">Notes</div>
              <div className="card">
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{exercise.notes}</p>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {tab === 'progress' ? (
        <div role="tabpanel" aria-label="Progress">
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
        </div>
      ) : null}

      {tab === 'history' ? (
        <div role="tabpanel" aria-label="History">
          {sessions.length === 0 ? (
            <div className="empty">
              <span className="emoji">📈</span>
              No logged sessions yet.
              <div className="small">Log this exercise in a workout to see your history.</div>
            </div>
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
                  <div className="row-sub">Volume {s.total_volume.toLocaleString()} · {s.sets.length} sets</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit exercise">
        <form className="stack" onSubmit={onSave}>
          <ExerciseFormFields value={form} onChange={setForm} hideMuscleGroup={linked} />
          {linked ? (
            <div className="field">
              <label>Muscle groups</label>
              <div className="row wrap" style={{ gap: 'var(--sp-2)' }}>
                <span className="badge badge-active">{muscleGroupLabel(exercise.primary_muscle_group)}</span>
                {exercise.secondary_muscle_groups.map((g) => (
                  <span key={g} className="badge">{muscleGroupLabel(g)}</span>
                ))}
              </div>
              <p className="muted small" style={{ marginTop: 'var(--sp-2)' }}>
                From catalog{exercise.catalog_name ? `: ${exercise.catalog_name}` : ''}.
              </p>
              <Button type="button" variant="ghost" block onClick={() => setLinked(false)}>
                Make custom (edit muscle groups)
              </Button>
            </div>
          ) : null}
          <ErrorText>{error}</ErrorText>
          <Button type="submit" variant="primary" block disabled={updateMut.isPending}>
            {updateMut.isPending ? 'Saving…' : 'Save changes'}
          </Button>
          <Button
            type="button"
            variant="danger"
            block
            disabled={deleteMut.isPending}
            onClick={() => {
              if (confirm(`Delete "${exercise.name}"? Past sessions are kept.`)) deleteMut.mutate()
            }}
          >
            {deleteMut.isPending ? 'Deleting…' : 'Delete exercise'}
          </Button>
        </form>
      </Sheet>
    </Layout>
  )
}
