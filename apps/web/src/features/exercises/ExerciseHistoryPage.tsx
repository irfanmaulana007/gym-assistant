import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { exercisesApi, type ExerciseInput } from '@/api/routines'
import { Layout } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Button, ErrorText, Spinner } from '@/components/ui'
import { PencilIcon } from '@/components/icons'
import { EMPTY_EXERCISE_FORM, ExerciseFormFields, exerciseToInput, normalizeExerciseInput } from './ExerciseForm'
import { formatDate } from '@/lib/format'
import { ApiError } from '@/api/client'

const TREND_LABEL: Record<string, string> = {
  up: '▲ Improving',
  down: '▼ Down',
  flat: '▬ Holding',
  none: 'Not enough data yet',
}

export function ExerciseHistoryPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['exercise-history', id],
    queryFn: () => exercisesApi.history(id),
  })

  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState<ExerciseInput>(EMPTY_EXERCISE_FORM)
  const [error, setError] = useState('')

  const routineId = data?.exercise.routine_id

  const openEdit = () => {
    if (data) setForm(exerciseToInput(data.exercise))
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
        navigate('/')
      }
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not delete exercise'),
  })

  function onSave(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) {
      setError('Exercise name is required')
      return
    }
    updateMut.mutate(normalizeExerciseInput(form))
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

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit exercise">
        <form className="stack" onSubmit={onSave}>
          <ExerciseFormFields value={form} onChange={setForm} />
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
