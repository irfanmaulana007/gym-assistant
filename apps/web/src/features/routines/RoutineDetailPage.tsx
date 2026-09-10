import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { exercisesApi, routinesApi, type ExerciseInput } from '@/api/routines'
import { sessionsApi } from '@/api/sessions'
import { Layout } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Button, ErrorText, Field, Spinner } from '@/components/ui'
import { ChevronRight, PencilIcon, PlusIcon } from '@/components/icons'
import { EMPTY_EXERCISE_FORM, ExerciseFormFields, normalizeExerciseInput } from '@/features/exercises/ExerciseForm'
import { muscleGroupLabel } from '@/types/api'
import { formatLastSet, formatTarget } from '@/lib/format'
import { ApiError } from '@/api/client'

export function RoutineDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: routine, isLoading, isError } = useQuery({
    queryKey: ['routine', id],
    queryFn: () => routinesApi.get(id),
  })

  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm] = useState<ExerciseInput>(EMPTY_EXERCISE_FORM)
  const [error, setError] = useState('')

  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editError, setEditError] = useState('')

  const openSheet = () => {
    setForm(EMPTY_EXERCISE_FORM)
    setError('')
    setSheetOpen(true)
  }

  const openEdit = () => {
    setEditName(routine?.name ?? '')
    setEditNotes(routine?.notes ?? '')
    setEditError('')
    setEditOpen(true)
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['routine', id] })
  }

  const addMut = useMutation({
    mutationFn: (input: ExerciseInput) => exercisesApi.create(id, input),
    onSuccess: () => {
      setForm(EMPTY_EXERCISE_FORM)
      setSheetOpen(false)
      invalidate()
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not add exercise'),
  })

  const updateMut = useMutation({
    mutationFn: (patch: { name: string; notes: string }) => routinesApi.update(id, patch),
    onSuccess: () => {
      setEditOpen(false)
      invalidate()
      qc.invalidateQueries({ queryKey: ['routines'] })
    },
    onError: (e) => setEditError(e instanceof ApiError ? e.message : 'Could not save changes'),
  })

  const deleteMut = useMutation({
    mutationFn: () => routinesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routines'] })
      navigate('/')
    },
    onError: (e) => setEditError(e instanceof ApiError ? e.message : 'Could not delete workout day'),
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
    addMut.mutate(normalizeExerciseInput(form))
  }

  function onSaveRoutine(e: FormEvent) {
    e.preventDefault()
    setEditError('')
    if (!editName.trim()) {
      setEditError('Workout day name is required')
      return
    }
    updateMut.mutate({ name: editName.trim(), notes: editNotes.trim() })
  }

  if (isLoading) return <Layout title="Loading…" back="/"><Spinner /></Layout>
  if (isError || !routine) return <Layout title="Not found" back="/"><ErrorText>Routine not found.</ErrorText></Layout>

  const exercises = routine.exercises ?? []

  const actions = (
    <>
      <button type="button" className="icon-btn" aria-label="Edit workout day" onClick={openEdit}>
        <PencilIcon />
      </button>
      <button type="button" className="icon-btn" aria-label="Add exercise" onClick={openSheet}>
        <PlusIcon />
      </button>
    </>
  )

  return (
    <Layout title={routine.name} back="/" backLabel="Workouts" action={actions}>
      {exercises.length > 0 ? (
        <>
          <div className="section-label">Exercises</div>
          <ul className="list">
            {exercises.map((ex) => (
              <li key={ex.id} className="list-item">
                <Link
                  to={`/exercises/${ex.id}/history`}
                  className="row"
                  style={{ color: 'inherit', minWidth: 0 }}
                  aria-label={`${ex.name} history`}
                >
                  <div className="grow">
                    <div className="row-title">{ex.name}</div>
                    <div className="row-sub row wrap" style={{ gap: 'var(--sp-2)' }}>
                      <span>{formatTarget(ex.measurement_type, ex.target_sets, ex.target_reps, ex.target_duration_seconds)}</span>
                      <span className="badge">{muscleGroupLabel(ex.primary_muscle_group)}</span>
                      {ex.last_set ? <span className="muted">Last {formatLastSet(ex.last_set)}</span> : null}
                    </div>
                  </div>
                  <ChevronRight className="chevron" />
                </Link>
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
          <ExerciseFormFields value={form} onChange={setForm} />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" variant="primary" block disabled={addMut.isPending}>
            {addMut.isPending ? 'Adding…' : 'Save exercise'}
          </Button>
        </form>
      </Sheet>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit workout day">
        <form className="stack" onSubmit={onSaveRoutine}>
          <Field
            label="Workout day name"
            name="edit-routine-name"
            placeholder="Push Day"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <Field
            label="Notes"
            name="edit-routine-notes"
            placeholder="Optional"
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
          />
          <ErrorText>{editError}</ErrorText>
          <Button type="submit" variant="primary" block disabled={updateMut.isPending}>
            {updateMut.isPending ? 'Saving…' : 'Save changes'}
          </Button>
          <Button
            type="button"
            variant="danger"
            block
            disabled={deleteMut.isPending}
            onClick={() => {
              if (confirm(`Delete "${routine.name}"? Past sessions are kept.`)) deleteMut.mutate()
            }}
          >
            {deleteMut.isPending ? 'Deleting…' : 'Delete workout day'}
          </Button>
        </form>
      </Sheet>

      <div className="bottom-cta">
        {!sheetOpen && !editOpen && error ? <ErrorText>{error}</ErrorText> : null}
        <Button
          variant="primary"
          block
          disabled={startMut.isPending || exercises.length === 0}
          onClick={() => startMut.mutate()}
        >
          {startMut.isPending ? 'Starting…' : 'Start workout'}
        </Button>
      </div>
    </Layout>
  )
}
