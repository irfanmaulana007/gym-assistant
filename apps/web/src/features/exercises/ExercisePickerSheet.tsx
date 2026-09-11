import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { exercisesApi, type ExerciseInput } from '@/api/routines'
import { ApiError } from '@/api/client'
import { Sheet } from '@/components/Sheet'
import { Button, ErrorText, Field, Spinner } from '@/components/ui'
import { ChevronRight } from '@/components/icons'
import { useExerciseCatalog } from '@/hooks/useExerciseCatalog'
import {
  MUSCLE_GROUPS,
  muscleGroupLabel,
  type CatalogExercise,
  type MeasurementType,
  type MuscleGroup,
} from '@/types/api'
import {
  EMPTY_EXERCISE_FORM,
  ExerciseFormFields,
  MEASUREMENT_LABELS,
  normalizeExerciseInput,
  normalizeTargets,
} from './ExerciseForm'

type Step = 'list' | 'targets' | 'custom'

interface TargetsForm {
  measurement_type: MeasurementType
  target_sets: number
  target_reps: number
  target_minutes: number
}

const DEFAULT_TARGETS: TargetsForm = {
  measurement_type: 'weight_reps',
  target_sets: 4,
  target_reps: 8,
  target_minutes: 30,
}

// ExercisePickerSheet is the "Add exercise" flow (PRD 0006): pick a known
// movement from the shared catalog (muscle groups come from the catalog), enter
// only the per-workout targets, and save — or fall back to the free-text
// "Custom exercise" form for movements not in the catalog.
export function ExercisePickerSheet({
  open,
  onClose,
  routineId,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  routineId: string
  onAdded: () => void
}) {
  const [step, setStep] = useState<Step>('list')
  const [search, setSearch] = useState('')
  const [muscleFilter, setMuscleFilter] = useState<MuscleGroup | null>(null)
  const [selected, setSelected] = useState<CatalogExercise | null>(null)
  const [targets, setTargets] = useState<TargetsForm>(DEFAULT_TARGETS)
  const [customForm, setCustomForm] = useState<ExerciseInput>(EMPTY_EXERCISE_FORM)
  const [error, setError] = useState('')

  const { data, isLoading, isError } = useExerciseCatalog()

  // Reset to a clean picker each time the sheet opens.
  useEffect(() => {
    if (open) {
      setStep('list')
      setSearch('')
      setMuscleFilter(null)
      setSelected(null)
      setError('')
      setCustomForm(EMPTY_EXERCISE_FORM)
    }
  }, [open])

  const addMut = useMutation({
    mutationFn: (input: ExerciseInput) => exercisesApi.create(routineId, input),
    onSuccess: () => {
      onAdded()
      onClose()
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not add exercise'),
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((e) => {
      if (muscleFilter && e.primary_muscle_group !== muscleFilter) return false
      if (q && !e.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [data, search, muscleFilter])

  function pick(entry: CatalogExercise) {
    setSelected(entry)
    setTargets({ ...DEFAULT_TARGETS, measurement_type: entry.default_measurement_type })
    setError('')
    setStep('targets')
  }

  function onSaveTargets(e: FormEvent) {
    e.preventDefault()
    if (!selected) return
    setError('')
    addMut.mutate({
      catalog_exercise_id: selected.id,
      ...normalizeTargets({
        measurement_type: targets.measurement_type,
        target_sets: targets.target_sets,
        target_reps: targets.target_reps,
        target_duration_seconds: targets.target_minutes * 60,
      }),
    })
  }

  function onSaveCustom(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!customForm.name?.trim()) {
      setError('Exercise name is required')
      return
    }
    addMut.mutate(normalizeExerciseInput(customForm))
  }

  const title = step === 'list' ? 'Add exercise' : step === 'custom' ? 'Custom exercise' : (selected?.name ?? 'Exercise')
  const isDuration = targets.measurement_type === 'duration'

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {step === 'list' ? (
        <div className="stack">
          <Field
            label="Search"
            name="catalog-search"
            placeholder="Search exercises…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
          <div className="chip-row" role="group" aria-label="Filter by muscle group">
            <button
              type="button"
              className={`chip${muscleFilter === null ? ' chip-active' : ''}`}
              onClick={() => setMuscleFilter(null)}
            >
              All
            </button>
            {MUSCLE_GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                className={`chip${muscleFilter === g ? ' chip-active' : ''}`}
                onClick={() => setMuscleFilter((cur) => (cur === g ? null : g))}
              >
                {muscleGroupLabel(g)}
              </button>
            ))}
          </div>

          {isLoading ? (
            <Spinner />
          ) : isError ? (
            <ErrorText>Could not load the exercise catalog.</ErrorText>
          ) : filtered.length === 0 ? (
            <p className="muted" style={{ padding: 'var(--sp-4) 0' }}>
              No matching exercises. Try a different search or add a custom exercise.
            </p>
          ) : (
            <ul className="list-grouped" aria-label="Exercise catalog">
              {filtered.map((entry) => (
                <li key={entry.id}>
                  <button type="button" className="nav-row" onClick={() => pick(entry)} aria-label={`Add ${entry.name}`}>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row-title">{entry.name}</div>
                      <div className="row-sub row wrap" style={{ gap: 'var(--sp-2)' }}>
                        <span className="badge">{muscleGroupLabel(entry.primary_muscle_group)}</span>
                        {entry.secondary_muscle_groups.map((g) => (
                          <span key={g} className="badge">{muscleGroupLabel(g)}</span>
                        ))}
                      </div>
                    </div>
                    <ChevronRight className="chevron" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Button type="button" variant="ghost" block onClick={() => { setError(''); setStep('custom') }}>
            Custom exercise
          </Button>
        </div>
      ) : step === 'targets' && selected ? (
        <form className="stack" onSubmit={onSaveTargets}>
          <button type="button" className="link-back" onClick={() => setStep('list')}>‹ Back to catalog</button>
          <div className="row wrap" style={{ gap: 'var(--sp-2)' }}>
            <span className="badge badge-active">{muscleGroupLabel(selected.primary_muscle_group)}</span>
            {selected.secondary_muscle_groups.map((g) => (
              <span key={g} className="badge">{muscleGroupLabel(g)}</span>
            ))}
          </div>
          <div className="field">
            <label htmlFor="targets-type">Type</label>
            <select
              id="targets-type"
              className="select"
              value={targets.measurement_type}
              onChange={(e) => setTargets((t) => ({ ...t, measurement_type: e.target.value as MeasurementType }))}
            >
              {(Object.keys(MEASUREMENT_LABELS) as MeasurementType[]).map((mt) => (
                <option key={mt} value={mt}>{MEASUREMENT_LABELS[mt]}</option>
              ))}
            </select>
          </div>
          {isDuration ? (
            <Field
              label="Target minutes"
              name="targets-minutes"
              type="number"
              min={1}
              value={targets.target_minutes}
              onChange={(e) => setTargets((t) => ({ ...t, target_minutes: Number(e.target.value) }))}
            />
          ) : (
            <div className="row">
              <Field
                label="Sets"
                name="targets-sets"
                type="number"
                min={1}
                value={targets.target_sets}
                onChange={(e) => setTargets((t) => ({ ...t, target_sets: Number(e.target.value) }))}
              />
              <Field
                label="Reps"
                name="targets-reps"
                type="number"
                min={1}
                value={targets.target_reps}
                onChange={(e) => setTargets((t) => ({ ...t, target_reps: Number(e.target.value) }))}
              />
            </div>
          )}
          <ErrorText>{error}</ErrorText>
          <Button type="submit" variant="primary" block disabled={addMut.isPending}>
            {addMut.isPending ? 'Adding…' : `Add ${selected.name}`}
          </Button>
        </form>
      ) : (
        <form className="stack" onSubmit={onSaveCustom}>
          <button type="button" className="link-back" onClick={() => setStep('list')}>‹ Back to catalog</button>
          <ExerciseFormFields value={customForm} onChange={setCustomForm} />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" variant="primary" block disabled={addMut.isPending}>
            {addMut.isPending ? 'Adding…' : 'Save exercise'}
          </Button>
        </form>
      )}
    </Sheet>
  )
}
