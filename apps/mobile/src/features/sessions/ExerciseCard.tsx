import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { color, radius, sp } from '@/theme'
import { Button } from '@/components/ui'
import { Segmented } from '@/components/Segmented'
import { CheckIcon } from '@/components/icons'
import { formatDuration, formatLastSet, formatTarget } from '@/lib/format'
import { getStore } from '@/db'
import { addEntry, deleteEntry, updateEntry } from '@/db/repositories'
import { newId } from '@/db/id'
import { useSync } from '@/lib/sync'
import { muscleGroupLabel, type SessionExercise, type SetEntry, type WeightUnit } from '@/types/api'

// One exercise's logging card (ports apps/web ExerciseCard.tsx). Logging a set
// and toggling "done" are LOCAL writes via the repositories, wrapped in
// `commit` so the store updates, the UI refreshes, and sync is nudged — no
// network wait, works offline.
export function ExerciseCard({
  sx,
  disabled,
  preferredUnit,
}: {
  sx: SessionExercise
  disabled: boolean
  preferredUnit: WeightUnit
}) {
  const { commit } = useSync()
  const isDuration = sx.measurement_type === 'duration'
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [minutes, setMinutes] = useState('')
  const [unitOverride, setUnitOverride] = useState<WeightUnit | null>(null)
  const unit = unitOverride ?? preferredUnit
  const done = sx.status === 'completed'

  function toggleDone() {
    const next = done ? 'pending' : 'completed'
    commit(() => {
      const store = getStore()
      const row = store.sessionExercises.get(sx.id)
      if (!row) return
      store.sessionExercises.upsert({
        ...row,
        status: next,
        completed_at: next === 'completed' ? new Date().toISOString() : null,
      })
      store.outbox.enqueue({
        id: newId(),
        entity: 'session_exercise',
        op: 'update',
        entity_id: sx.id,
        payload: { status: next },
        base_version: null,
        created_at: new Date().toISOString(),
        state: 'pending',
        attempts: 0,
        next_attempt_at: 0,
        last_error: null,
      })
    })
  }

  function logSet() {
    if (isDuration) {
      const secs = Math.round(Number(minutes) * 60)
      if (!secs) return
      commit(() => addEntry(getStore(), sx.id, { duration_seconds: secs, is_completed: true }))
      setMinutes('')
    } else {
      const w = weight === '' ? null : Number(weight)
      const r = reps === '' ? null : Number(reps)
      if (r == null) return
      commit(() => addEntry(getStore(), sx.id, { weight: w, reps: r, weight_unit: w == null ? null : unit, is_completed: true }))
      setWeight('')
      setReps('')
    }
  }

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={done ? `Mark ${sx.name_snapshot} not done` : `Mark ${sx.name_snapshot} done`}
          disabled={disabled}
          onPress={toggleDone}
          style={[s.checkbox, done && s.checkboxDone]}
        >
          {done ? <CheckIcon size={15} color={color.primaryInk} /> : null}
        </Pressable>
        <View style={s.grow}>
          <Text style={[s.name, done && s.nameDone]}>{sx.name_snapshot}</Text>
          <Text style={s.sub}>
            Target {formatTarget(sx.measurement_type, sx.target_sets, sx.target_reps, sx.target_duration_seconds)} ·{' '}
            {muscleGroupLabel(sx.primary_muscle_group)}
          </Text>
          {sx.last_set ? <Text style={s.sub}>Last time {formatLastSet(sx.last_set, preferredUnit)}</Text> : null}
        </View>
        {!disabled && !isDuration ? (
          <View style={s.unitToggle}>
            <Segmented
              options={[
                { value: 'kg', label: 'kg' },
                { value: 'lb', label: 'lb' },
              ]}
              value={unit}
              onChange={(v) => setUnitOverride(v as WeightUnit)}
            />
          </View>
        ) : null}
      </View>

      {sx.entries && sx.entries.length > 0 ? (
        <View style={s.entries}>
          {sx.entries.map((e) => (
            <EntryRow key={e.id} entry={e} name={sx.name_snapshot} isDuration={isDuration} preferredUnit={preferredUnit} disabled={disabled} />
          ))}
        </View>
      ) : null}

      {!disabled ? (
        <View style={s.logRow}>
          {isDuration ? (
            <TextInput
              style={[s.input, s.grow]}
              keyboardType="decimal-pad"
              placeholder="minutes"
              placeholderTextColor={color.textFaint}
              value={minutes}
              onChangeText={setMinutes}
            />
          ) : (
            <>
              <TextInput
                style={[s.input, s.grow]}
                keyboardType="decimal-pad"
                placeholder={unit}
                placeholderTextColor={color.textFaint}
                value={weight}
                onChangeText={setWeight}
              />
              <TextInput
                style={[s.input, s.grow]}
                keyboardType="number-pad"
                placeholder="reps"
                placeholderTextColor={color.textFaint}
                value={reps}
                onChangeText={setReps}
              />
            </>
          )}
          <Button size="sm" variant="primary" title="Log" onPress={logSet} />
        </View>
      ) : null}
    </View>
  )
}

function EntryRow({
  entry,
  name,
  isDuration,
  preferredUnit,
  disabled,
}: {
  entry: SetEntry
  name: string
  isDuration: boolean
  preferredUnit: WeightUnit
  disabled: boolean
}) {
  const { commit } = useSync()
  const [editing, setEditing] = useState(false)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [minutes, setMinutes] = useState('')

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
      commit(() => updateEntry(getStore(), entry.id, { duration_seconds: secs }))
    } else {
      const w = weight === '' ? null : Number(weight)
      const r = reps === '' ? null : Number(reps)
      if (r == null) return
      commit(() => updateEntry(getStore(), entry.id, { weight: w, reps: r, weight_unit: w == null ? null : entry.weight_unit ?? preferredUnit }))
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <View style={[s.entryRow, s.entryRowEditing]}>
        <Text style={s.idx}>Set {entry.entry_number}</Text>
        {isDuration ? (
          <TextInput style={[s.input, s.grow]} keyboardType="decimal-pad" placeholder="minutes" placeholderTextColor={color.textFaint} value={minutes} onChangeText={setMinutes} />
        ) : (
          <>
            <TextInput style={[s.input, s.grow]} keyboardType="decimal-pad" placeholder={entry.weight_unit ?? preferredUnit} placeholderTextColor={color.textFaint} value={weight} onChangeText={setWeight} />
            <TextInput style={[s.input, s.grow]} keyboardType="number-pad" placeholder="reps" placeholderTextColor={color.textFaint} value={reps} onChangeText={setReps} />
          </>
        )}
        <Button size="sm" variant="primary" title="Save" onPress={saveEdit} />
        <Button size="sm" variant="ghost" title="Cancel" onPress={() => setEditing(false)} />
        <Button size="sm" variant="danger" title="Delete" onPress={() => commit(() => deleteEntry(getStore(), entry.id))} />
      </View>
    )
  }

  return (
    <View style={s.entryRow}>
      <Text style={s.idx}>Set {entry.entry_number}</Text>
      <Text style={s.val}>
        {entry.duration_seconds != null
          ? formatDuration(entry.duration_seconds)
          : `${entry.weight ?? '—'}${entry.weight_unit ?? ''} × ${entry.reps ?? '—'}`}
      </Text>
      {!disabled ? <Button size="sm" variant="ghost" title="Edit" onPress={startEdit} /> : null}
    </View>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: radius.base, padding: sp[4], gap: sp[3] },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: sp[3] },
  grow: { flex: 1, minWidth: 0 },
  checkbox: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.borderStrong,
    backgroundColor: color.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: color.primary, borderColor: color.primary },
  name: { fontSize: 16, fontWeight: '700', color: color.text },
  nameDone: { textDecorationLine: 'line-through', color: color.textMuted },
  sub: { fontSize: 13, color: color.textMuted, marginTop: 2 },
  unitToggle: { width: 92 },
  entries: { gap: sp[1] },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: sp[2] },
  input: {
    backgroundColor: color.bgElevated,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.sm,
    color: color.text,
    paddingHorizontal: sp[3],
    minHeight: 44,
    fontSize: 16,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: sp[2],
    paddingVertical: sp[2],
    paddingHorizontal: sp[3],
    backgroundColor: color.bgElevated,
    borderRadius: radius.sm,
    flexWrap: 'wrap',
  },
  entryRowEditing: {},
  idx: { color: color.textMuted, fontSize: 14 },
  val: { fontWeight: '600', color: color.text, fontSize: 14, fontVariant: ['tabular-nums'] },
})
