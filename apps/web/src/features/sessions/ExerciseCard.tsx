import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sessionsApi, type EntryInput } from '@/api/sessions'
import { Button } from '@/components/ui'
import { Segmented } from '@/components/Segmented'
import { formatDistance, formatDuration, formatLastSet, formatPace, formatTarget } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import {
  muscleGroupLabel,
  type DistanceUnit,
  type SessionExercise,
  type SetEntry,
  type WeightUnit,
  type WorkoutSession,
} from '@/types/api'

const sessionKey = (sessionId: string) => ['session', sessionId] as const

// Immutably apply a change to one session-exercise inside the cached session,
// leaving the rest of the session untouched. Used for optimistic updates.
function patchSessionExercise(
  session: WorkoutSession | undefined,
  sxId: string,
  fn: (sx: SessionExercise) => SessionExercise,
): WorkoutSession | undefined {
  if (!session?.exercises) return session
  return { ...session, exercises: session.exercises.map((e) => (e.id === sxId ? fn(e) : e)) }
}

// parseNum turns a text input into a number or null (empty / non-positive → null
// for optional fields), so an untouched optional field is sent as null.
function parseNum(v: string): number | null {
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// One checklist row: shows target, a done toggle, logged entries, and inline
// inputs to log a weight set, a timed bout, or a cardio/distance run.
//
// Logging a set and toggling "done" both update the cached session optimistically
// (React Query onMutate) so the row reflects the tap instantly — no waiting for
// the round-trip. onSettled reconciles with the server; onError rolls back.
export function ExerciseCard({ sessionId, sx, disabled }: { sessionId: string; sx: SessionExercise; disabled: boolean }) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const preferredUnit = user?.preferred_weight_unit ?? 'kg'
  const invalidate = () => qc.invalidateQueries({ queryKey: sessionKey(sessionId) })

  const isDuration = sx.measurement_type === 'duration'
  const isDistance = sx.measurement_type === 'distance'
  const isCardio = isDuration || isDistance

  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [minutes, setMinutes] = useState('')
  const [distance, setDistance] = useState('')
  // Optional cardio metrics (PRD 0019): heart rate + incline, logged per bout.
  const [avgHr, setAvgHr] = useState('')
  const [maxHr, setMaxHr] = useState('')
  const [incline, setIncline] = useState('')
  // Sticky-per-exercise unit for logging: defaults to the user's preferred unit
  // (which loads asynchronously), but can be switched to match whatever the
  // machine in front of them shows. Store only the explicit override so the
  // default stays reactive until the user picks a unit for this exercise.
  const [unitOverride, setUnitOverride] = useState<WeightUnit | null>(null)
  const unit = unitOverride ?? preferredUnit
  // Distance unit defaults to the exercise's target unit (else km); the toggle
  // offers km/mi, the two running units.
  const [distUnitOverride, setDistUnitOverride] = useState<DistanceUnit | null>(null)
  const distUnit: DistanceUnit = distUnitOverride ?? (sx.distance_unit === 'mi' ? 'mi' : 'km')

  const pace = isDistance ? formatPace(parseNum(distance), distUnit, minutes === '' ? null : Math.round(Number(minutes) * 60)) : null

  const toggleMut = useMutation({
    mutationFn: (status: SessionExercise['status']) => sessionsApi.updateSessionExercise(sx.id, { status }),
    onMutate: async (status) => {
      await qc.cancelQueries({ queryKey: sessionKey(sessionId) })
      const prev = qc.getQueryData<WorkoutSession>(sessionKey(sessionId))
      qc.setQueryData<WorkoutSession | undefined>(sessionKey(sessionId), (old) =>
        patchSessionExercise(old, sx.id, (e) => ({
          ...e,
          status,
          completed_at: status === 'completed' ? new Date().toISOString() : null,
        })),
      )
      return { prev }
    },
    onError: (_err, _status, ctx) => {
      if (ctx?.prev) qc.setQueryData(sessionKey(sessionId), ctx.prev)
    },
    onSettled: invalidate,
  })

  const logMut = useMutation({
    mutationFn: (input: EntryInput) => sessionsApi.addEntry(sx.id, input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: sessionKey(sessionId) })
      const prev = qc.getQueryData<WorkoutSession>(sessionKey(sessionId))
      const now = new Date().toISOString()
      const optimisticId = `optimistic-${crypto.randomUUID()}`
      qc.setQueryData<WorkoutSession | undefined>(sessionKey(sessionId), (old) =>
        patchSessionExercise(old, sx.id, (e) => {
          const optimisticEntry: SetEntry = {
            id: optimisticId,
            session_exercise_id: e.id,
            entry_number: (e.entries?.length ?? 0) + 1,
            weight: input.weight ?? null,
            weight_unit: input.weight_unit ?? null,
            reps: input.reps ?? null,
            duration_seconds: input.duration_seconds ?? null,
            distance: input.distance ?? null,
            distance_unit: input.distance_unit ?? null,
            incline: input.incline ?? null,
            speed: null,
            avg_heart_rate: input.avg_heart_rate ?? null,
            max_heart_rate: input.max_heart_rate ?? null,
            rpe: null,
            is_completed: input.is_completed ?? true,
            performed_at: now,
            metadata: {},
            created_at: now,
          }
          return {
            ...e,
            entries: [...(e.entries ?? []), optimisticEntry],
            sets_completed: e.sets_completed + 1,
          }
        }),
      )
      // Clear the inputs right away so the next set can be logged without waiting.
      setWeight('')
      setReps('')
      setMinutes('')
      setDistance('')
      setAvgHr('')
      setMaxHr('')
      setIncline('')
      return { prev }
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(sessionKey(sessionId), ctx.prev)
    },
    onSettled: invalidate,
  })

  const done = sx.status === 'completed'

  // Shared optional cardio metrics (heart rate + incline) attached to a logged bout.
  function cardioMetrics(): Pick<EntryInput, 'avg_heart_rate' | 'max_heart_rate' | 'incline'> {
    return { avg_heart_rate: parseNum(avgHr), max_heart_rate: parseNum(maxHr), incline: parseNum(incline) }
  }

  function logSet() {
    if (isDistance) {
      const d = parseNum(distance)
      if (d == null || d <= 0) return
      const secs = minutes === '' ? null : Math.round(Number(minutes) * 60)
      logMut.mutate({ distance: d, distance_unit: distUnit, duration_seconds: secs, ...cardioMetrics() })
    } else if (isDuration) {
      const secs = Math.round(Number(minutes) * 60)
      if (!secs) return
      logMut.mutate({ duration_seconds: secs, ...cardioMetrics() })
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
          disabled={disabled}
          onClick={() => toggleMut.mutate(done ? 'pending' : 'completed')}
        >
          {done ? '✓' : ''}
        </button>
        <div className="grow">
          <strong style={{ textDecoration: done ? 'line-through' : 'none' }}>{sx.name_snapshot}</strong>
          <div className="small muted">
            Target{' '}
            {formatTarget(sx.measurement_type, sx.target_sets, sx.target_reps, sx.target_duration_seconds, sx.target_distance, sx.distance_unit)}{' '}
            · <span className="badge">{muscleGroupLabel(sx.primary_muscle_group)}</span>
          </div>
          {sx.last_set ? (
            <div className="small muted">Last time {formatLastSet(sx.last_set, preferredUnit)}</div>
          ) : null}
        </div>
        {!disabled && isDistance ? (
          <div className="unit-toggle">
            <Segmented
              options={[
                { value: 'km', label: 'km' },
                { value: 'mi', label: 'mi' },
              ]}
              value={distUnit}
              onChange={setDistUnitOverride}
              ariaLabel={`${sx.name_snapshot} distance unit`}
            />
          </div>
        ) : !disabled && !isCardio ? (
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
              measurementType={sx.measurement_type}
              preferredUnit={preferredUnit}
              disabled={disabled}
              onChanged={invalidate}
            />
          ))}
        </ul>
      ) : null}

      {!disabled ? (
        <div className="stack" style={{ gap: 'var(--sp-2)' }}>
          <div className="row">
            {isDistance ? (
              <>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  placeholder={distUnit}
                  aria-label={`${sx.name_snapshot} distance`}
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                />
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
              </>
            ) : isDuration ? (
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
            {!isCardio ? (
              <Button size="sm" variant="primary" onClick={logSet}>
                Log
              </Button>
            ) : null}
          </div>

          {isCardio ? (
            <>
              <div className="row">
                <input
                  className="input"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="avg HR"
                  aria-label={`${sx.name_snapshot} average heart rate`}
                  value={avgHr}
                  onChange={(e) => setAvgHr(e.target.value)}
                />
                <input
                  className="input"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="max HR"
                  aria-label={`${sx.name_snapshot} max heart rate`}
                  value={maxHr}
                  onChange={(e) => setMaxHr(e.target.value)}
                />
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.1"
                  inputMode="decimal"
                  placeholder="incline %"
                  aria-label={`${sx.name_snapshot} incline`}
                  value={incline}
                  onChange={(e) => setIncline(e.target.value)}
                />
                <Button size="sm" variant="primary" onClick={logSet}>
                  Log
                </Button>
              </div>
              {pace ? <div className="small muted">Pace {pace}</div> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

// Human-readable summary of a logged entry, picked by measurement type:
// a run → "5km · 27:30 · 5:30 /km · ♥150"; a timed bout → "30:00 · ♥150";
// a strength set → "60kg × 8".
function describeEntry(entry: SetEntry, isDistance: boolean, isDuration: boolean): string {
  if (isDistance) {
    const parts: string[] = []
    const dist = formatDistance(entry.distance, entry.distance_unit)
    if (dist) parts.push(dist)
    if (entry.duration_seconds != null) parts.push(formatDuration(entry.duration_seconds))
    const pace = formatPace(entry.distance, entry.distance_unit, entry.duration_seconds)
    if (pace) parts.push(pace)
    if (entry.avg_heart_rate != null) parts.push(`♥${entry.avg_heart_rate}`)
    return parts.length ? parts.join(' · ') : '—'
  }
  if (isDuration) {
    const parts: string[] = []
    if (entry.duration_seconds != null) parts.push(formatDuration(entry.duration_seconds))
    if (entry.avg_heart_rate != null) parts.push(`♥${entry.avg_heart_rate}`)
    return parts.length ? parts.join(' · ') : '—'
  }
  return `${entry.weight ?? '—'}${entry.weight_unit ?? ''} × ${entry.reps ?? '—'}`
}

// One logged set. Read-only pill by default; tapping Edit reveals inline inputs
// pre-filled with the set's values so a mistyped number can be corrected — or the
// set deleted — without leaving the session. Delete lives inside the edit state so
// it can't be hit by accident mid-workout.
function EntryRow({
  entry,
  name,
  measurementType,
  preferredUnit,
  disabled,
  onChanged,
}: {
  entry: SetEntry
  name: string
  measurementType: string
  preferredUnit: WeightUnit
  disabled: boolean
  onChanged: () => void
}) {
  const isDuration = measurementType === 'duration'
  const isDistance = measurementType === 'distance'
  const [editing, setEditing] = useState(false)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [minutes, setMinutes] = useState('')
  const [distance, setDistance] = useState('')
  const [avgHr, setAvgHr] = useState('')
  const [maxHr, setMaxHr] = useState('')
  const [incline, setIncline] = useState('')

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
    setDistance(entry.distance == null ? '' : String(entry.distance))
    setAvgHr(entry.avg_heart_rate == null ? '' : String(entry.avg_heart_rate))
    setMaxHr(entry.max_heart_rate == null ? '' : String(entry.max_heart_rate))
    setIncline(entry.incline == null ? '' : String(entry.incline))
    setEditing(true)
  }

  function saveEdit() {
    if (isDistance) {
      const d = parseNum(distance)
      if (d == null || d <= 0) return
      updateMut.mutate({
        distance: d,
        distance_unit: entry.distance_unit ?? 'km',
        duration_seconds: minutes === '' ? null : Math.round(Number(minutes) * 60),
        avg_heart_rate: parseNum(avgHr),
        max_heart_rate: parseNum(maxHr),
        incline: parseNum(incline),
      })
    } else if (isDuration) {
      const secs = Math.round(Number(minutes) * 60)
      if (!secs) return
      updateMut.mutate({
        duration_seconds: secs,
        avg_heart_rate: parseNum(avgHr),
        max_heart_rate: parseNum(maxHr),
        incline: parseNum(incline),
      })
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
        {isDistance ? (
          <>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder={entry.distance_unit ?? 'km'}
              aria-label={`${name} set ${entry.entry_number} distance`}
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
            />
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
            <input
              className="input"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="avg HR"
              aria-label={`${name} set ${entry.entry_number} average heart rate`}
              value={avgHr}
              onChange={(e) => setAvgHr(e.target.value)}
            />
          </>
        ) : isDuration ? (
          <>
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
            <input
              className="input"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="avg HR"
              aria-label={`${name} set ${entry.entry_number} average heart rate`}
              value={avgHr}
              onChange={(e) => setAvgHr(e.target.value)}
            />
          </>
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
      <span className="val">{describeEntry(entry, isDistance, isDuration)}</span>
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
