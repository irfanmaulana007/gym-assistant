import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sessionsApi } from '@/api/sessions'
import { Layout } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Button, ErrorText, Field, Spinner } from '@/components/ui'
import { useElapsed } from '@/hooks/useElapsed'
import { formatDuration } from '@/lib/format'
import { ExerciseCard } from './ExerciseCard'
import { SessionSummary } from './SessionSummary'

export function ActiveSessionPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['session', id] })

  const { data: session, isLoading, isError } = useQuery({
    queryKey: ['session', id],
    queryFn: () => sessionsApi.get(id),
    refetchInterval: (q) => (q.state.data?.status === 'active' ? 15_000 : false),
  })

  const [adHocName, setAdHocName] = useState('')
  const [error, setError] = useState('')
  // Confirmation sheet shown on Stop so an accidental tap can't silently end the
  // workout — the user picks Save (complete) or Discard (abandon) deliberately.
  const [stopOpen, setStopOpen] = useState(false)
  const [stopError, setStopError] = useState('')

  const pauseMut = useMutation({ mutationFn: () => sessionsApi.pause(id), onSuccess: invalidate })
  const resumeMut = useMutation({ mutationFn: () => sessionsApi.resume(id), onSuccess: invalidate })
  const completeMut = useMutation({
    mutationFn: () => sessionsApi.complete(id),
    onSuccess: () => {
      setStopOpen(false)
      invalidate()
    },
    onError: () => setStopError('Could not save the workout. Try again.'),
  })
  const abandonMut = useMutation({
    mutationFn: () => sessionsApi.abandon(id),
    onSuccess: () => {
      setStopOpen(false)
      invalidate()
    },
    onError: () => setStopError('Could not discard the workout. Try again.'),
  })
  const addMut = useMutation({
    mutationFn: (name: string) => sessionsApi.addExercise(id, { name, measurement_type: 'weight_reps', primary_muscle_group: 'other' }),
    onSuccess: () => {
      setAdHocName('')
      invalidate()
    },
    onError: () => setError('Could not add exercise'),
  })

  const running = session?.status === 'active'
  const elapsed = useElapsed(session?.started_at ?? null, running)

  if (isLoading) return <Layout title="Loading…"><Spinner /></Layout>
  if (isError || !session) return <Layout title="Session"><ErrorText>Session not found.</ErrorText></Layout>

  const finished = session.status === 'completed' || session.status === 'abandoned'

  if (finished) {
    return (
      <Layout title="Workout complete" back="/" backLabel="Home">
        <SessionSummary session={session} />
      </Layout>
    )
  }

  function onAddAdHoc(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!adHocName.trim()) return
    addMut.mutate(adHocName.trim())
  }

  const paused = session.status === 'paused'

  return (
    <Layout title="Active workout">
      <div className="session-bar row-between">
        <div className="row">
          <span className={`pulse-dot ${paused ? 'paused' : ''}`} />
          <div>
            <div className="small muted">{paused ? 'Paused' : 'Elapsed'}</div>
            <div className="timer">{formatDuration(elapsed)}</div>
          </div>
        </div>
        <div className="row">
          {paused ? (
            <Button size="sm" variant="primary" disabled={resumeMut.isPending} onClick={() => resumeMut.mutate()}>
              Resume
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled={pauseMut.isPending} onClick={() => pauseMut.mutate()}>
              Pause
            </Button>
          )}
          <Button
            size="sm"
            variant="danger"
            disabled={completeMut.isPending || abandonMut.isPending}
            onClick={() => {
              setStopError('')
              setStopOpen(true)
            }}
          >
            Stop
          </Button>
        </div>
      </div>

      <ul className="list">
        {session.exercises?.map((sx) => (
          <ExerciseCard key={sx.id} sessionId={id} sx={sx} disabled={paused} />
        ))}
      </ul>

      <form className="card row" onSubmit={onAddAdHoc}>
        <div className="grow">
          <Field
            label="Add exercise"
            name="adhoc"
            placeholder="e.g. Incline Walk"
            value={adHocName}
            onChange={(e) => setAdHocName(e.target.value)}
          />
        </div>
        <Button type="submit" style={{ alignSelf: 'end' }} disabled={addMut.isPending}>
          Add
        </Button>
      </form>
      <ErrorText>{error}</ErrorText>

      <Sheet open={stopOpen} onClose={() => setStopOpen(false)} title="Finish workout?">
        <div className="stack">
          <p className="muted">
            Save this workout to keep it in your history, or discard it if you didn't mean to stop.
          </p>
          <Button
            variant="primary"
            block
            disabled={completeMut.isPending || abandonMut.isPending}
            onClick={() => {
              setStopError('')
              completeMut.mutate()
            }}
          >
            {completeMut.isPending ? 'Saving…' : 'Save workout'}
          </Button>
          <Button
            variant="danger"
            block
            disabled={completeMut.isPending || abandonMut.isPending}
            onClick={() => {
              setStopError('')
              abandonMut.mutate()
            }}
          >
            {abandonMut.isPending ? 'Discarding…' : 'Discard workout'}
          </Button>
          <Button
            variant="ghost"
            block
            disabled={completeMut.isPending || abandonMut.isPending}
            onClick={() => setStopOpen(false)}
          >
            Keep going
          </Button>
          <ErrorText>{stopError}</ErrorText>
        </div>
      </Sheet>
    </Layout>
  )
}
