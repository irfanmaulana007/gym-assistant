import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { exercisesApi, routinesApi, type ExerciseInput } from '@/api/routines'
import { sessionsApi } from '@/api/sessions'
import { Layout } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Button, ErrorText, Field, Spinner } from '@/components/ui'
import { ChevronRight, PlusIcon } from '@/components/icons'
import { MUSCLE_GROUP_SECTIONS, muscleGroupLabel, type MeasurementType } from '@/types/api'
import { formatTarget } from '@/lib/format'
import { ApiError } from '@/api/client'

const MEASUREMENT_LABELS: Record<MeasurementType, string> = {
  weight_reps: 'Weight × reps',
  reps_only: 'Reps only',
  duration: 'Duration',
  distance: 'Distance',
}

const EMPTY_FORM: ExerciseInput = {
  name: '',
  measurement_type: 'weight_reps',
  primary_muscle_group: 'chest',
  target_sets: 4,
  target_reps: 8,
}

export function RoutineDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: routine, isLoading, isError } = useQuery({
    queryKey: ['routine', id],
    queryFn: () => routinesApi.get(id),
  })

  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm] = useState<ExerciseInput>(EMPTY_FORM)
  const [error, setError] = useState('')

  const openSheet = () => {
    setForm(EMPTY_FORM)
    setError('')
    setSheetOpen(true)
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['routine', id] })
  }

  const addMut = useMutation({
    mutationFn: (input: ExerciseInput) => exercisesApi.create(id, input),
    onSuccess: () => {
      setForm(EMPTY_FORM)
      setSheetOpen(false)
      invalidate()
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not add exercise'),
  })

  const deleteMut = useMutation({
    mutationFn: (exId: string) => exercisesApi.remove(exId),
    onSuccess: invalidate,
  })

  const startMut = useMutation({
    mutationFn: () => sessionsApi.start(id),
    onSuccess: (session) => navigate(`/sessions/${session.id}`),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not start session'),
  })

  function onAdd(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) {
      setError('Exercise name is required')
      return
    }
    const isDuration = form.measurement_type === 'duration'
    addMut.mutate({
      ...form,
      name: form.name.trim(),
      target_sets: isDuration ? null : form.target_sets,
      target_reps: isDuration ? null : form.target_reps,
      target_duration_seconds: isDuration ? form.target_duration_seconds ?? 1800 : null,
    })
  }

  if (isLoading) return <Layout title="Loading…" back="/"><Spinner /></Layout>
  if (isError || !routine) return <Layout title="Not found" back="/"><ErrorText>Routine not found.</ErrorText></Layout>

  const isDuration = form.measurement_type === 'duration'
  const exercises = routine.exercises ?? []

  const addAction = (
    <button type="button" className="icon-btn" aria-label="Add exercise" onClick={openSheet}>
      <PlusIcon />
    </button>
  )

  return (
    <Layout title={routine.name} back="/" backLabel="Workouts" action={addAction}>
      {exercises.length > 0 ? (
        <>
          <div className="section-label">Exercises</div>
          <ul className="list">
            {exercises.map((ex) => (
              <li key={ex.id} className="list-item">
                <div className="row-between">
                  <Link
                    to={`/exercises/${ex.id}/history`}
                    className="row grow"
                    style={{ color: 'inherit', minWidth: 0 }}
                    aria-label={`${ex.name} history`}
                  >
                    <div className="grow">
                      <div className="row-title">{ex.name}</div>
                      <div className="row-sub row wrap" style={{ gap: 'var(--sp-2)' }}>
                        <span>{formatTarget(ex.measurement_type, ex.target_sets, ex.target_reps, ex.target_duration_seconds)}</span>
                        <span className="badge">{muscleGroupLabel(ex.primary_muscle_group)}</span>
                      </div>
                    </div>
                    <ChevronRight className="chevron" />
                  </Link>
                  <Button size="sm" variant="danger" aria-label={`Delete ${ex.name}`} onClick={() => deleteMut.mutate(ex.id)}>
                    ✕
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="empty">
          <span className="emoji">💪</span>
          No exercises yet.
          <div className="small" style={{ marginTop: 'var(--sp-4)' }}>
            <Button variant="primary" onClick={openSheet}>Add your first exercise</Button>
          </div>
        </div>
      )}

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Add exercise">
        <form className="stack" onSubmit={onAdd}>
          <Field
            label="Name"
            name="ex-name"
            placeholder="Bench Press"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div className="field">
            <label htmlFor="ex-type">Type</label>
            <select
              id="ex-type"
              className="select"
              value={form.measurement_type}
              onChange={(e) => setForm((f) => ({ ...f, measurement_type: e.target.value as MeasurementType }))}
            >
              {(Object.keys(MEASUREMENT_LABELS) as MeasurementType[]).map((mt) => (
                <option key={mt} value={mt}>{MEASUREMENT_LABELS[mt]}</option>
              ))}
            </select>
          </div>
          {isDuration ? (
            <Field
              label="Target minutes"
              name="ex-minutes"
              type="number"
              min={1}
              value={form.target_duration_seconds ? Math.round(form.target_duration_seconds / 60) : 30}
              onChange={(e) => setForm((f) => ({ ...f, target_duration_seconds: Number(e.target.value) * 60 }))}
            />
          ) : (
            <div className="row">
              <Field
                label="Sets"
                name="ex-sets"
                type="number"
                min={1}
                value={form.target_sets ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, target_sets: Number(e.target.value) }))}
              />
              <Field
                label="Reps"
                name="ex-reps"
                type="number"
                min={1}
                value={form.target_reps ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, target_reps: Number(e.target.value) }))}
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="ex-muscle">Primary muscle group</label>
            <select
              id="ex-muscle"
              className="select"
              value={form.primary_muscle_group}
              onChange={(e) => setForm((f) => ({ ...f, primary_muscle_group: e.target.value as ExerciseInput['primary_muscle_group'] }))}
            >
              {MUSCLE_GROUP_SECTIONS.map((section) => (
                <optgroup key={section.label} label={section.label}>
                  {section.groups.map((g) => (
                    <option key={g} value={g}>{muscleGroupLabel(g)}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" variant="primary" block disabled={addMut.isPending}>
            {addMut.isPending ? 'Adding…' : 'Save exercise'}
          </Button>
        </form>
      </Sheet>

      <div className="bottom-cta">
        {!sheetOpen && error ? <ErrorText>{error}</ErrorText> : null}
        <Button
          variant="primary"
          block
          disabled={startMut.isPending || (routine.exercises?.length ?? 0) === 0}
          onClick={() => startMut.mutate()}
        >
          {startMut.isPending ? 'Starting…' : 'Start workout'}
        </Button>
      </div>
    </Layout>
  )
}
