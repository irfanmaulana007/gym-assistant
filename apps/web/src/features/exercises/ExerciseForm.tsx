import type { ExerciseInput } from '@/api/routines'
import { Field } from '@/components/ui'
import { MUSCLE_GROUP_SECTIONS, muscleGroupLabel, type DistanceUnit, type Exercise, type MeasurementType } from '@/types/api'

export const MEASUREMENT_LABELS: Record<MeasurementType, string> = {
  weight_reps: 'Weight × reps',
  reps_only: 'Reps only',
  duration: 'Duration',
  distance: 'Distance',
}

// Distance units offered in the exercise forms, with the default used when a
// distance exercise has no unit yet.
export const DISTANCE_UNITS: DistanceUnit[] = ['km', 'mi', 'm']
export const DEFAULT_DISTANCE_UNIT: DistanceUnit = 'km'

export const EMPTY_EXERCISE_FORM: ExerciseInput = {
  name: '',
  measurement_type: 'weight_reps',
  primary_muscle_group: 'chest',
  target_sets: 3,
  target_reps: 12,
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
    target_distance: ex.target_distance,
    distance_unit: ex.distance_unit,
    notes: ex.notes,
  }
}

// Normalize the form before create/update: each measurement type carries only
// its own target fields — duration a duration, distance a distance + unit,
// everything else sets × reps.
export function normalizeExerciseInput(form: ExerciseInput): ExerciseInput {
  const isDuration = form.measurement_type === 'duration'
  const isDistance = form.measurement_type === 'distance'
  return {
    ...form,
    name: (form.name ?? '').trim(),
    target_sets: isDuration || isDistance ? null : form.target_sets,
    target_reps: isDuration || isDistance ? null : form.target_reps,
    target_duration_seconds: isDuration ? form.target_duration_seconds ?? 1800 : null,
    target_distance: isDistance ? form.target_distance ?? 1 : null,
    distance_unit: isDistance ? form.distance_unit ?? DEFAULT_DISTANCE_UNIT : null,
  }
}

// normalizeTargets returns just the per-workout target fields for a given
// measurement type — used by the catalog "targets only" flow where name and
// muscle groups come from the catalog.
export function normalizeTargets(input: {
  measurement_type: MeasurementType
  target_sets?: number | null
  target_reps?: number | null
  target_duration_seconds?: number | null
  target_distance?: number | null
  distance_unit?: DistanceUnit | null
}): Pick<
  ExerciseInput,
  'measurement_type' | 'target_sets' | 'target_reps' | 'target_duration_seconds' | 'target_distance' | 'distance_unit'
> {
  const isDuration = input.measurement_type === 'duration'
  const isDistance = input.measurement_type === 'distance'
  return {
    measurement_type: input.measurement_type,
    target_sets: isDuration || isDistance ? null : input.target_sets ?? null,
    target_reps: isDuration || isDistance ? null : input.target_reps ?? null,
    target_duration_seconds: isDuration ? input.target_duration_seconds ?? 1800 : null,
    target_distance: isDistance ? input.target_distance ?? 1 : null,
    distance_unit: isDistance ? input.distance_unit ?? DEFAULT_DISTANCE_UNIT : null,
  }
}

// The shared field inputs for an exercise create/edit form. The parent owns the
// enclosing <form>, submit button, error text, and the mutation.
export function ExerciseFormFields({
  value,
  onChange,
  hideMuscleGroup = false,
}: {
  value: ExerciseInput
  onChange: (next: ExerciseInput) => void
  // When true, the primary-muscle-group select is hidden — used when the
  // exercise is catalog-linked and its muscle groups are shown read-only.
  hideMuscleGroup?: boolean
}) {
  const isDuration = value.measurement_type === 'duration'
  const isDistance = value.measurement_type === 'distance'
  const patch = (p: Partial<ExerciseInput>) => onChange({ ...value, ...p })

  return (
    <>
      <Field
        label="Name"
        name="ex-name"
        placeholder="Bench Press"
        value={value.name ?? ''}
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
      ) : isDistance ? (
        <div className="row">
          <Field
            label="Target distance"
            name="ex-distance"
            type="number"
            min={0}
            step="any"
            value={value.target_distance ?? 0}
            onChange={(e) => patch({ target_distance: Number(e.target.value) })}
          />
          <div className="field">
            <label htmlFor="ex-distance-unit">Unit</label>
            <select
              id="ex-distance-unit"
              className="select"
              value={value.distance_unit ?? DEFAULT_DISTANCE_UNIT}
              onChange={(e) => patch({ distance_unit: e.target.value as DistanceUnit })}
            >
              {DISTANCE_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>
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
      {hideMuscleGroup ? null : (
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
                  <option key={g} value={g}>{muscleGroupLabel(g)}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}
    </>
  )
}
