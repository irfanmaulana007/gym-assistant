import type { ExerciseInput } from '@/api/routines'
import { Field } from '@/components/ui'
import { MUSCLE_GROUP_SECTIONS, type Exercise, type MeasurementType } from '@/types/api'

export const MEASUREMENT_LABELS: Record<MeasurementType, string> = {
  weight_reps: 'Weight × reps',
  reps_only: 'Reps only',
  duration: 'Duration',
  distance: 'Distance',
}

export const EMPTY_EXERCISE_FORM: ExerciseInput = {
  name: '',
  measurement_type: 'weight_reps',
  primary_muscle_group: 'chest',
  target_sets: 4,
  target_reps: 8,
}

// Map a persisted exercise back into the editable form shape.
export function exerciseToInput(ex: Exercise): ExerciseInput {
  return {
    name: ex.name,
    measurement_type: ex.measurement_type,
    primary_muscle_group: ex.primary_muscle_group,
    secondary_muscle_groups: ex.secondary_muscle_groups,
    target_sets: ex.target_sets,
    target_reps: ex.target_reps,
    target_weight: ex.target_weight,
    target_duration_seconds: ex.target_duration_seconds,
    notes: ex.notes,
  }
}

// Normalize the form before create/update: duration exercises carry only a
// duration, everything else carries sets × reps.
export function normalizeExerciseInput(form: ExerciseInput): ExerciseInput {
  const isDuration = form.measurement_type === 'duration'
  return {
    ...form,
    name: form.name.trim(),
    target_sets: isDuration ? null : form.target_sets,
    target_reps: isDuration ? null : form.target_reps,
    target_duration_seconds: isDuration ? form.target_duration_seconds ?? 1800 : null,
  }
}

// The shared field inputs for an exercise create/edit form. The parent owns the
// enclosing <form>, submit button, error text, and the mutation.
export function ExerciseFormFields({
  value,
  onChange,
}: {
  value: ExerciseInput
  onChange: (next: ExerciseInput) => void
}) {
  const isDuration = value.measurement_type === 'duration'
  const patch = (p: Partial<ExerciseInput>) => onChange({ ...value, ...p })

  return (
    <>
      <Field
        label="Name"
        name="ex-name"
        placeholder="Bench Press"
        value={value.name}
        onChange={(e) => patch({ name: e.target.value })}
      />
      <div className="field">
        <label htmlFor="ex-type">Type</label>
        <select
          id="ex-type"
          className="select"
          value={value.measurement_type}
          onChange={(e) => patch({ measurement_type: e.target.value as MeasurementType })}
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
          value={value.target_duration_seconds ? Math.round(value.target_duration_seconds / 60) : 30}
          onChange={(e) => patch({ target_duration_seconds: Number(e.target.value) * 60 })}
        />
      ) : (
        <div className="row">
          <Field
            label="Sets"
            name="ex-sets"
            type="number"
            min={1}
            value={value.target_sets ?? 0}
            onChange={(e) => patch({ target_sets: Number(e.target.value) })}
          />
          <Field
            label="Reps"
            name="ex-reps"
            type="number"
            min={1}
            value={value.target_reps ?? 0}
            onChange={(e) => patch({ target_reps: Number(e.target.value) })}
          />
        </div>
      )}
      <div className="field">
        <label htmlFor="ex-muscle">Primary muscle group</label>
        <select
          id="ex-muscle"
          className="select"
          value={value.primary_muscle_group}
          onChange={(e) => patch({ primary_muscle_group: e.target.value as ExerciseInput['primary_muscle_group'] })}
        >
          {MUSCLE_GROUP_SECTIONS.map((section) => (
            <optgroup key={section.label} label={section.label}>
              {section.groups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </>
  )
}
