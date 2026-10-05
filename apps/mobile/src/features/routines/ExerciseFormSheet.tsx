import React, { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { color, g, radius, sp } from '@/theme'
import { Button, ErrorText, Field } from '@/components/ui'
import { Sheet } from '@/components/Sheet'
import { Segmented } from '@/components/Segmented'
import {
  MUSCLE_GROUP_SECTIONS,
  muscleGroupLabel,
  type MeasurementType,
  type MuscleGroup,
} from '@/types/api'
import type { ExerciseDraft } from '@/db'

// Ported from apps/web/src/features/exercises/ExerciseForm.tsx — the shared
// exercise form shape, labels, and normalization, plus the RN field inputs.

export const MEASUREMENT_LABELS: Record<MeasurementType, string> = {
  weight_reps: 'Weight × reps',
  reps_only: 'Reps only',
  duration: 'Duration',
  distance: 'Distance',
}

const MEASUREMENT_SHORT: Record<MeasurementType, string> = {
  weight_reps: 'Weight',
  reps_only: 'Reps',
  duration: 'Time',
  distance: 'Dist',
}

export const EMPTY_EXERCISE_FORM: ExerciseDraft = {
  name: '',
  measurement_type: 'weight_reps',
  primary_muscle_group: 'chest',
  secondary_muscle_groups: [],
  target_sets: 3,
  target_reps: 12,
}

/** Normalize before create: duration carries only a duration; else sets × reps. */
export function normalizeExerciseInput(form: ExerciseDraft): ExerciseDraft {
  const isDuration = form.measurement_type === 'duration'
  return {
    ...form,
    name: (form.name ?? '').trim(),
    target_sets: isDuration ? null : form.target_sets,
    target_reps: isDuration ? null : form.target_reps,
    target_duration_seconds: isDuration ? form.target_duration_seconds ?? 1800 : null,
  }
}

/** Just the per-workout target fields for a measurement type (catalog flow). */
export function normalizeTargets(input: {
  measurement_type: MeasurementType
  target_sets?: number | null
  target_reps?: number | null
  target_duration_seconds?: number | null
}): Pick<ExerciseDraft, 'measurement_type' | 'target_sets' | 'target_reps' | 'target_duration_seconds'> {
  const isDuration = input.measurement_type === 'duration'
  return {
    measurement_type: input.measurement_type,
    target_sets: isDuration ? null : input.target_sets ?? null,
    target_reps: isDuration ? null : input.target_reps ?? null,
    target_duration_seconds: isDuration ? input.target_duration_seconds ?? 1800 : null,
  }
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipActive]}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </Pressable>
  )
}

/** Single-select primary muscle group, grouped by body area (native chips). */
export function MuscleGroupPicker({
  value,
  onChange,
  label = 'Primary muscle group',
}: {
  value: MuscleGroup
  onChange: (g: MuscleGroup) => void
  label?: string
}) {
  return (
    <View style={g.field}>
      <Text style={g.label}>{label}</Text>
      {MUSCLE_GROUP_SECTIONS.map((section) => (
        <View key={section.label} style={s.section}>
          <Text style={s.sectionLabel}>{section.label}</Text>
          <View style={s.chipWrap}>
            {section.groups.map((grp) => (
              <Chip key={grp} label={muscleGroupLabel(grp)} active={value === grp} onPress={() => onChange(grp as MuscleGroup)} />
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

/** Multi-select secondary muscle groups. */
export function SecondaryMusclePicker({
  value,
  onChange,
}: {
  value: MuscleGroup[]
  onChange: (groups: MuscleGroup[]) => void
}) {
  const toggle = (grp: MuscleGroup) =>
    onChange(value.includes(grp) ? value.filter((v) => v !== grp) : [...value, grp])
  return (
    <View style={g.field}>
      <Text style={g.label}>Secondary muscle groups</Text>
      {MUSCLE_GROUP_SECTIONS.map((section) => (
        <View key={section.label} style={s.section}>
          <Text style={s.sectionLabel}>{section.label}</Text>
          <View style={s.chipWrap}>
            {section.groups.map((grp) => (
              <Chip key={grp} label={muscleGroupLabel(grp)} active={value.includes(grp as MuscleGroup)} onPress={() => toggle(grp as MuscleGroup)} />
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

/** The exercise create/edit form body. Parent owns the submit button + mutation. */
export function ExerciseFormFields({
  value,
  onChange,
  hideMuscleGroup = false,
}: {
  value: ExerciseDraft
  onChange: (next: ExerciseDraft) => void
  hideMuscleGroup?: boolean
}) {
  const isDuration = value.measurement_type === 'duration'
  const patch = (p: Partial<ExerciseDraft>) => onChange({ ...value, ...p })
  return (
    <View style={g.stack}>
      <Field label="Name" placeholder="Bench Press" value={value.name} onChangeText={(t) => patch({ name: t })} />
      <View style={g.field}>
        <Text style={g.label}>Type</Text>
        <Segmented
          options={(Object.keys(MEASUREMENT_LABELS) as MeasurementType[]).map((mt) => ({ value: mt, label: MEASUREMENT_SHORT[mt] }))}
          value={value.measurement_type}
          onChange={(mt) => patch({ measurement_type: mt })}
        />
      </View>
      {isDuration ? (
        <Field
          label="Target minutes"
          keyboardType="number-pad"
          value={String(value.target_duration_seconds ? Math.round(value.target_duration_seconds / 60) : 30)}
          onChangeText={(t) => patch({ target_duration_seconds: (Number(t) || 0) * 60 })}
        />
      ) : (
        <View style={g.row}>
          <View style={g.grow}>
            <Field label="Sets" keyboardType="number-pad" value={String(value.target_sets ?? 0)} onChangeText={(t) => patch({ target_sets: Number(t) || 0 })} />
          </View>
          <View style={g.grow}>
            <Field label="Reps" keyboardType="number-pad" value={String(value.target_reps ?? 0)} onChangeText={(t) => patch({ target_reps: Number(t) || 0 })} />
          </View>
        </View>
      )}
      {hideMuscleGroup ? null : (
        <MuscleGroupPicker value={value.primary_muscle_group} onChange={(grp) => patch({ primary_muscle_group: grp })} />
      )}
    </View>
  )
}

// A standalone sheet for creating a custom exercise.
export function ExerciseFormSheet({
  open,
  onClose,
  onSubmit,
  initial,
  title = 'Custom exercise',
}: {
  open: boolean
  onClose: () => void
  onSubmit: (draft: ExerciseDraft) => void
  initial?: ExerciseDraft
  title?: string
}) {
  const [form, setForm] = useState<ExerciseDraft>(initial ?? EMPTY_EXERCISE_FORM)
  const [error, setError] = useState('')
  const submit = () => {
    if (!form.name?.trim()) {
      setError('Exercise name is required')
      return
    }
    onSubmit(normalizeExerciseInput(form))
  }
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <ExerciseFormFields value={form} onChange={setForm} />
        <ErrorText>{error}</ErrorText>
        <View style={{ marginTop: sp[3] }}>
          <Button title="Save exercise" variant="primary" block onPress={submit} />
        </View>
      </ScrollView>
    </Sheet>
  )
}

const s = StyleSheet.create({
  section: { gap: sp[1], marginBottom: sp[2] },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: color.textFaint },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: sp[2] },
  chip: {
    paddingVertical: sp[2],
    paddingHorizontal: sp[3],
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: 'transparent',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: color.primarySoft, borderColor: color.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: color.textMuted },
  chipTextActive: { color: color.primary },
})
