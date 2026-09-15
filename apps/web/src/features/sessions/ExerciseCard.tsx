import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sessionsApi, type EntryInput } from '@/api/sessions'
import { Button } from '@/components/ui'
import { Segmented } from '@/components/Segmented'
import { formatDuration, formatLastSet, formatTarget } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import { muscleGroupLabel, type SessionExercise, type SetEntry, type WeightUnit } from '@/types/api'

// One checklist row: shows target, a done toggle, logged entries, and inline
// inputs to log a weight set or a timed bout.
export function ExerciseCard({ sessionId, sx, disabled }: { sessionId: string; sx: SessionExercise; disabled: boolean }) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const preferredUnit = user?.preferred_weight_unit ?? 'kg'
  const invalidate = () => qc.invalidateQueries({ queryKey: ['session', sessionId] })

  const isDuration = sx.measurement_type === 'duration'
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [minutes, setMinutes] = useState('')
  // Sticky-per-exercise unit for logging: defaults to the user's preferred unit
  // (which loads asynchronously), but can be switched to match whatever the
  // machine in front of them shows. Store only the explicit override so the
  // default stays reactive until the user picks a unit for this exercise.
  const [unitOverride, setUnitOverride] = useState<WeightUnit | null>(null)
  const unit = unitOverride ?? preferredUnit

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
      logMut.mutate({ weight: w, reps: r, weight_unit: w == null ? null : unit })
    }
  }

  return (
    <li className="list-item stack" data-flip-key={sx.id}>
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
            <div className="small muted">Last time {formatLastSet(sx.last_set, preferredUnit)}</div>
          ) : null}
        </div>
        {!disabled && !isDuration ? (
          <div className="unit-toggle">
            <Segmented
              options={[
                { value: 'kg', label: 'kg' },
                { value: 'lb', label: 'lb' },
              ]}
              value={unit}
              onChange={setUnitOverride}
              ariaLabel={`${sx.name_snapshot} weight unit`}
            />
          </div>
        ) : null}
      </div>

      {sx.entries && sx.entries.length > 0 ? (
        <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 'var(--sp-1)' }}>
          {sx.entries.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              name={sx.name_snapshot}
              isDuration={isDuration}
              preferredUnit={preferredUnit}
              disabled={disabled}
              onChanged={invalidate}
            />
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
                placeholder={unit}
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

// One logged set. Read-only pill by default; tapping Edit reveals inline inputs
// pre-filled with the set's values so a mistyped weight/reps (or duration) can
// be corrected — or the set deleted — without leaving the session. Delete lives
// inside the edit state so it can't be hit by accident mid-workout.
function EntryRow({
  entry,
  name,
  isDuration,
  preferredUnit,
  disabled,
  onChanged,
}: {
  entry: SetEntry
  name: string
  isDuration: boolean
  preferredUnit: WeightUnit
  disabled: boolean
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [minutes, setMinutes] = useState('')

  const updateMut = useMutation({
    mutationFn: (input: EntryInput) => sessionsApi.updateEntry(entry.id, input),
    onSuccess: () => {
      setEditing(false)
      onChanged()
    },
  })
  const deleteMut = useMutation({
    mutationFn: () => sessionsApi.removeEntry(entry.id),
    onSuccess: () => {
      setEditing(false)
      onChanged()
    },
  })
  const busy = updateMut.isPending || deleteMut.isPending

  function startEdit() {
    setWeight(entry.weight == null ? '' : String(entry.weight))
    setReps(entry.reps == null ? '' : String(entry.reps))
    setMinutes(entry.duration_seconds == null ? '' : String(entry.duration_seconds / 60))
    setEditing(true)
  }

  function saveEdit() {
    if (isDuration) {
      const secs = Math.round(Number(minutes) * 60)
      if (!secs) return
      updateMut.mutate({ duration_seconds: secs })
    } else {
      const w = weight === '' ? null : Number(weight)
      const r = reps === '' ? null : Number(reps)
      if (r == null) return
      updateMut.mutate({ weight: w, reps: r, weight_unit: w == null ? undefined : entry.weight_unit ?? preferredUnit })
    }
  }

  if (editing) {
    return (
      <li className="entry-row entry-row-editing">
        <span className="idx">Set {entry.entry_number}</span>
        {isDuration ? (
          <input
            className="input"
            type="number"
            min={0}
            inputMode="decimal"
            placeholder="minutes"
            aria-label={`${name} set ${entry.entry_number} minutes`}
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
              placeholder={entry.weight_unit ?? preferredUnit}
              aria-label={`${name} set ${entry.entry_number} weight`}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
            <input
              className="input"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="reps"
              aria-label={`${name} set ${entry.entry_number} reps`}
              value={reps}
              onChange={(e) => setReps(e.target.value)}
            />
          </>
        )}
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          aria-label={`Save set ${entry.entry_number} of ${name}`}
          onClick={saveEdit}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          aria-label={`Cancel editing set ${entry.entry_number} of ${name}`}
          onClick={() => setEditing(false)}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={busy}
          aria-label={`Delete set ${entry.entry_number} of ${name}`}
          onClick={() => deleteMut.mutate()}
        >
          Delete
        </Button>
      </li>
    )
  }

  return (
    <li className="entry-row">
      <span className="idx">Set {entry.entry_number}</span>
      <span className="val">
        {entry.duration_seconds != null
          ? formatDuration(entry.duration_seconds)
          : `${entry.weight ?? '—'}${entry.weight_unit ?? ''} × ${entry.reps ?? '—'}`}
      </span>
      {!disabled ? (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Edit set ${entry.entry_number} of ${name}`}
          onClick={startEdit}
        >
          Edit
        </Button>
      ) : null}
    </li>
  )
}
