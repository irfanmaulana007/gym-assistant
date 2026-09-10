import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sessionsApi } from '@/api/sessions'
import { Layout } from '@/components/Layout'
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

  const pauseMut = useMutation({ mutationFn: () => sessionsApi.pause(id), onSuccess: invalidate })
  const resumeMut = useMutation({ mutationFn: () => sessionsApi.resume(id), onSuccess: invalidate })
  const completeMut = useMutation({ mutationFn: () => sessionsApi.complete(id), onSuccess: invalidate })
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
            disabled={completeMut.isPending}
            onClick={() => {
              if (confirm('Finish this workout?')) completeMut.mutate()
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
    </Layout>
  )
}
