import React, { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { Sheet } from '@/components/Sheet'
import { Button, ErrorText, Field } from '@/components/ui'
import { Segmented } from '@/components/Segmented'
import { color, radius, sp } from '@/theme'
import { getStore } from '@/db'
import { deleteExercise, updateExercise, type ExerciseDraft } from '@/db/repositories'
import { useSync } from '@/lib/sync'
import {
  MUSCLE_GROUP_SECTIONS,
  muscleGroupLabel,
  type Exercise,
  type MeasurementType,
  type MuscleGroup,
} from '@/types/api'

const MEASUREMENT_OPTIONS: { value: MeasurementType; label: string }[] = [
  { value: 'weight_reps', label: 'Weight × reps' },
  { value: 'reps_only', label: 'Reps' },
  { value: 'duration', label: 'Duration' },
  { value: 'distance', label: 'Distance' },
]

// Edit sheet for a routine exercise (mirrors web ExerciseForm edit flow). When
// the exercise is catalog-linked its muscle groups are read-only (resolved from
// the catalog); "Make custom" unlinks and lets the primary group be edited.
export function ExerciseEditSheet({
  exercise,
  open,
  onClose,
  onDeleted,
}: {
  exercise: Exercise
  open: boolean
  onClose: () => void
  onDeleted: () => void
}) {
  const { commit } = useSync()
  const wasLinked = exercise.catalog_exercise_id != null
  const [name, setName] = useState(exercise.name)
  const [type, setType] = useState<MeasurementType>(exercise.measurement_type)
  const [sets, setSets] = useState(String(exercise.target_sets ?? 3))
  const [reps, setReps] = useState(String(exercise.target_reps ?? 12))
  const [minutes, setMinutes] = useState(
    String(exercise.target_duration_seconds ? Math.round(exercise.target_duration_seconds / 60) : 30),
  )
  const [primary, setPrimary] = useState<MuscleGroup>(exercise.primary_muscle_group)
  const [linked, setLinked] = useState(wasLinked)
  const [error, setError] = useState('')

  const isDuration = type === 'duration'

  function save() {
    if (!name.trim()) {
      setError('Exercise name is required')
      return
    }
    const patch: Partial<ExerciseDraft> & { catalog_exercise_id?: string | null } = {
      name: name.trim(),
      measurement_type: type,
      target_sets: isDuration ? null : Number(sets) || null,
      target_reps: isDuration ? null : Number(reps) || null,
      target_duration_seconds: isDuration ? (Number(minutes) || 30) * 60 : null,
    }
    if (!linked) {
      patch.primary_muscle_group = primary
      if (wasLinked) patch.catalog_exercise_id = null // make custom
    }
    commit(() => updateExercise(getStore(), exercise.id, patch))
    onClose()
  }

  function confirmDelete() {
    Alert.alert('Delete exercise', `Delete "${exercise.name}"? Past sessions are kept.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          commit(() => deleteExercise(getStore(), exercise.id))
          onDeleted()
        },
      },
    ])
  }

  return (
    <Sheet open={open} onClose={onClose} title="Edit exercise">
      <Field label="Name" placeholder="Bench Press" value={name} onChangeText={setName} />
      <View style={s.field}>
        <Text style={s.label}>Type</Text>
        <Segmented options={MEASUREMENT_OPTIONS} value={type} onChange={setType} />
      </View>
      {isDuration ? (
        <Field label="Target minutes" keyboardType="number-pad" value={minutes} onChangeText={setMinutes} />
      ) : (
        <View style={s.row}>
          <View style={s.grow}>
            <Field label="Sets" keyboardType="number-pad" value={sets} onChangeText={setSets} />
          </View>
          <View style={s.grow}>
            <Field label="Reps" keyboardType="number-pad" value={reps} onChangeText={setReps} />
          </View>
        </View>
      )}

      {linked ? (
        <View style={s.field}>
          <Text style={s.label}>Muscle groups</Text>
          <View style={s.chips}>
            <View style={[s.chip, s.chipActive]}>
              <Text style={s.chipActiveText}>{muscleGroupLabel(exercise.primary_muscle_group)}</Text>
            </View>
            {exercise.secondary_muscle_groups.map((grp) => (
              <View key={grp} style={s.chip}>
                <Text style={s.chipText}>{muscleGroupLabel(grp)}</Text>
              </View>
            ))}
          </View>
          <Text style={s.hint}>From catalog{exercise.catalog_name ? `: ${exercise.catalog_name}` : ''}.</Text>
          <Button title="Make custom (edit muscle groups)" variant="ghost" block onPress={() => setLinked(false)} />
        </View>
      ) : (
        <View style={s.field}>
          <Text style={s.label}>Primary muscle group</Text>
          {MUSCLE_GROUP_SECTIONS.map((section) => (
            <View key={section.label} style={s.section}>
              <Text style={s.sectionLabel}>{section.label}</Text>
              <View style={s.chips}>
                {section.groups.map((grp) => {
                  const active = grp === primary
                  return (
                    <Pressable
                      key={grp}
                      onPress={() => setPrimary(grp)}
                      style={[s.chip, active && s.chipActive]}
                    >
                      <Text style={active ? s.chipActiveText : s.chipText}>{muscleGroupLabel(grp)}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          ))}
        </View>
      )}

      <ErrorText>{error}</ErrorText>
      <Button title="Save changes" variant="primary" block onPress={save} />
      <Button title="Delete exercise" variant="danger" block onPress={confirmDelete} />
    </Sheet>
  )
}

const s = StyleSheet.create({
  field: { gap: sp[2] },
  label: { fontSize: 13, fontWeight: '500', color: color.textMuted, paddingLeft: 2 },
  row: { flexDirection: 'row', gap: sp[3] },
  grow: { flex: 1 },
  section: { gap: sp[1], marginBottom: sp[2] },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: color.textFaint },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: sp[2] },
  chip: {
    paddingVertical: sp[2],
    paddingHorizontal: sp[3],
    borderRadius: radius.pill,
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: { backgroundColor: color.primarySoft, borderColor: color.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: color.textMuted },
  chipActiveText: { fontSize: 13, fontWeight: '600', color: color.primary },
  hint: { color: color.textMuted, fontSize: 13 },
})
