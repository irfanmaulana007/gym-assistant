import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sessionsApi, type EntryInput } from '@/api/sessions'
import { Button } from '@/components/ui'
import { formatDuration, formatLastSet, formatTarget } from '@/lib/format'
import { muscleGroupLabel, type SessionExercise } from '@/types/api'

// One checklist row: shows target, a done toggle, logged entries, and inline
// inputs to log a weight set or a timed bout.
export function ExerciseCard({ sessionId, sx, disabled }: { sessionId: string; sx: SessionExercise; disabled: boolean }) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['session', sessionId] })

  const isDuration = sx.measurement_type === 'duration'
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [minutes, setMinutes] = useState('')

  const toggleMut = useMutation({
    mutationFn: (status: SessionExercise['status']) => sessionsApi.updateSessionExercise(sx.id, { status }),
    onSuccess: invalidate,
  })

  const logMut = useMutation({
    mutationFn: (input: EntryInput) => sessionsApi.addEntry(sx.id, input),
    onSuccess: () => {
      setWeight('')
      setReps('')
      setMinutes('')
      invalidate()
    },
  })

  const done = sx.status === 'completed'

  function logSet() {
    if (isDuration) {
      const secs = Math.round(Number(minutes) * 60)
      if (!secs) return
      logMut.mutate({ duration_seconds: secs })
    } else {
      const w = weight === '' ? null : Number(weight)
      const r = reps === '' ? null : Number(reps)
      if (r == null) return
      logMut.mutate({ weight: w, reps: r })
    }
  }

  return (
    <li className="list-item stack">
      <div className="row-between">
        <button
          type="button"
          className={`checkbox ${done ? 'checkbox-done' : ''}`}
          aria-label={done ? `Mark ${sx.name_snapshot} not done` : `Mark ${sx.name_snapshot} done`}
          aria-pressed={done}
          disabled={disabled || toggleMut.isPending}
          onClick={() => toggleMut.mutate(done ? 'pending' : 'completed')}
        >
          {done ? '✓' : ''}
        </button>
        <div className="grow">
          <strong style={{ textDecoration: done ? 'line-through' : 'none' }}>{sx.name_snapshot}</strong>
          <div className="small muted">
            Target {formatTarget(sx.measurement_type, sx.target_sets, sx.target_reps, sx.target_duration_seconds)} ·{' '}
            <span className="badge">{muscleGroupLabel(sx.primary_muscle_group)}</span>
          </div>
          {sx.last_set ? (
            <div className="small muted">Last time {formatLastSet(sx.last_set)}</div>
          ) : null}
        </div>
      </div>

      {sx.entries && sx.entries.length > 0 ? (
        <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 'var(--sp-1)' }}>
          {sx.entries.map((e) => (
            <li key={e.id} className="entry-row">
              <span className="idx">Set {e.entry_number}</span>
              <span className="val">
                {e.duration_seconds != null
                  ? formatDuration(e.duration_seconds)
                  : `${e.weight ?? '—'}${e.weight_unit ?? ''} × ${e.reps ?? '—'}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {!disabled ? (
        <div className="row">
          {isDuration ? (
            <input
              className="input"
              type="number"
              min={0}
              inputMode="decimal"
              placeholder="minutes"
              aria-label={`${sx.name_snapshot} minutes`}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          ) : (
            <>
              <input
                className="input"
                type="number"
                min={0}
                inputMode="decimal"
                placeholder={sx.last_set ? `${sx.last_set.weight}${sx.last_set.weight_unit}` : 'kg'}
                aria-label={`${sx.name_snapshot} weight`}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
              <input
                className="input"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="reps"
                aria-label={`${sx.name_snapshot} reps`}
                value={reps}
                onChange={(e) => setReps(e.target.value)}
              />
            </>
          )}
          <Button size="sm" variant="primary" disabled={logMut.isPending} onClick={logSet}>
            Log
          </Button>
        </div>
      ) : null}
    </li>
  )
}
