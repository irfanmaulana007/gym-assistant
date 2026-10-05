import React, { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { color, g, radius, sp } from '@/theme'
import { Button, ErrorText, Field, Spinner } from '@/components/ui'
import { Sheet } from '@/components/Sheet'
import { Segmented } from '@/components/Segmented'
import { ChevronRight } from '@/components/icons'
import { catalogApi } from '@/api/catalog'
import { MUSCLE_GROUPS, muscleGroupLabel, type CatalogExercise, type MeasurementType, type MuscleGroup } from '@/types/api'
import type { ExerciseDraft } from '@/db'
import { ExerciseFormFields, MEASUREMENT_LABELS, EMPTY_EXERCISE_FORM, normalizeExerciseInput, normalizeTargets } from './ExerciseFormSheet'

type Step = 'list' | 'targets' | 'custom'

interface TargetsForm {
  measurement_type: MeasurementType
  target_sets: number
  target_reps: number
  target_minutes: number
}

const DEFAULT_TARGETS: TargetsForm = { measurement_type: 'weight_reps', target_sets: 3, target_reps: 12, target_minutes: 30 }

const SHORT: Record<MeasurementType, string> = { weight_reps: 'Weight', reps_only: 'Reps', duration: 'Time', distance: 'Dist' }

// Ported from apps/web/src/features/exercises/ExercisePickerSheet.tsx. Offline-
// first difference: instead of calling the API, it emits a fully-formed
// ExerciseDraft via `onAdd`, and the parent writes it to the local store +
// outbox. Catalog muscle groups are copied onto the draft so the optimistic
// local row renders correctly before sync resolves the catalog link.
export function ExercisePickerSheet({
  open,
  onClose,
  onAdd,
  allowCustom = true,
}: {
  open: boolean
  onClose: () => void
  onAdd: (draft: ExerciseDraft) => void
  allowCustom?: boolean
}) {
  const [step, setStep] = useState<Step>('list')
  const [search, setSearch] = useState('')
  const [muscleFilter, setMuscleFilter] = useState<MuscleGroup | null>(null)
  const [selected, setSelected] = useState<CatalogExercise | null>(null)
  const [targets, setTargets] = useState<TargetsForm>(DEFAULT_TARGETS)
  const [customForm, setCustomForm] = useState<ExerciseDraft>(EMPTY_EXERCISE_FORM)
  const [error, setError] = useState('')

  const { data, isLoading, isError } = useQuery({ queryKey: ['catalog'], queryFn: () => catalogApi.list(), enabled: open })

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

  function saveTargets() {
    if (!selected) return
    const draft: ExerciseDraft = {
      name: selected.name,
      catalog_exercise_id: selected.id,
      primary_muscle_group: selected.primary_muscle_group,
      secondary_muscle_groups: selected.secondary_muscle_groups,
      ...normalizeTargets({
        measurement_type: targets.measurement_type,
        target_sets: targets.target_sets,
        target_reps: targets.target_reps,
        target_duration_seconds: targets.target_minutes * 60,
      }),
    }
    onAdd(draft)
    onClose()
  }

  function saveCustom() {
    if (!customForm.name?.trim()) {
      setError('Exercise name is required')
      return
    }
    onAdd(normalizeExerciseInput(customForm))
    onClose()
  }

  const title = step === 'list' ? 'Add exercise' : step === 'custom' ? 'Custom exercise' : selected?.name ?? 'Exercise'
  const isDuration = targets.measurement_type === 'duration'

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {step === 'list' ? (
        <View style={g.stack}>
          <Field label="Search" placeholder="Search exercises…" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
            <Pressable onPress={() => setMuscleFilter(null)} style={[s.chip, muscleFilter === null && s.chipActive]}>
              <Text style={[s.chipText, muscleFilter === null && s.chipTextActive]}>All</Text>
            </Pressable>
            {MUSCLE_GROUPS.map((grp) => (
              <Pressable key={grp} onPress={() => setMuscleFilter((cur) => (cur === grp ? null : (grp as MuscleGroup)))} style={[s.chip, muscleFilter === grp && s.chipActive]}>
                <Text style={[s.chipText, muscleFilter === grp && s.chipTextActive]}>{muscleGroupLabel(grp)}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {isLoading ? (
            <Spinner />
          ) : isError ? (
            <ErrorText>Could not load the exercise catalog (offline?). Add a custom exercise instead.</ErrorText>
          ) : filtered.length === 0 ? (
            <Text style={[g.muted, { paddingVertical: sp[4] }]}>No matching exercises. Try a different search or add a custom exercise.</Text>
          ) : (
            <View style={g.listGrouped}>
              {filtered.map((entry, i) => (
                <Pressable key={entry.id} onPress={() => pick(entry)} style={[g.navRow, i > 0 && g.listDivider]}>
                  <View style={g.grow}>
                    <Text style={g.rowTitle}>{entry.name}</Text>
                    <View style={[g.row, g.wrap, { gap: sp[2], marginTop: 2 }]}>
                      <View style={g.badge}>
                        <Text style={g.badgeText}>{muscleGroupLabel(entry.primary_muscle_group)}</Text>
                      </View>
                      {entry.secondary_muscle_groups.map((grp) => (
                        <View key={grp} style={g.badge}>
                          <Text style={g.badgeText}>{muscleGroupLabel(grp)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <ChevronRight size={20} color={color.textFaint} />
                </Pressable>
              ))}
            </View>
          )}

          {allowCustom ? <Button title="Custom exercise" variant="ghost" block onPress={() => { setError(''); setStep('custom') }} /> : null}
        </View>
      ) : step === 'targets' && selected ? (
        <View style={g.stack}>
          <Pressable onPress={() => setStep('list')}>
            <Text style={s.linkBack}>‹ Back to catalog</Text>
          </Pressable>
          <View style={[g.row, g.wrap, { gap: sp[2] }]}>
            <View style={[g.badge, g.badgeActive]}>
              <Text style={[g.badgeText, g.badgeActiveText]}>{muscleGroupLabel(selected.primary_muscle_group)}</Text>
            </View>
            {selected.secondary_muscle_groups.map((grp) => (
              <View key={grp} style={g.badge}>
                <Text style={g.badgeText}>{muscleGroupLabel(grp)}</Text>
              </View>
            ))}
          </View>
          <View style={g.field}>
            <Text style={g.label}>Type</Text>
            <Segmented
              options={(Object.keys(MEASUREMENT_LABELS) as MeasurementType[]).map((mt) => ({ value: mt, label: SHORT[mt] }))}
              value={targets.measurement_type}
              onChange={(mt) => setTargets((t) => ({ ...t, measurement_type: mt }))}
            />
          </View>
          {isDuration ? (
            <Field label="Target minutes" keyboardType="number-pad" value={String(targets.target_minutes)} onChangeText={(t) => setTargets((p) => ({ ...p, target_minutes: Number(t) || 0 }))} />
          ) : (
            <View style={g.row}>
              <View style={g.grow}>
                <Field label="Sets" keyboardType="number-pad" value={String(targets.target_sets)} onChangeText={(t) => setTargets((p) => ({ ...p, target_sets: Number(t) || 0 }))} />
              </View>
              <View style={g.grow}>
                <Field label="Reps" keyboardType="number-pad" value={String(targets.target_reps)} onChangeText={(t) => setTargets((p) => ({ ...p, target_reps: Number(t) || 0 }))} />
              </View>
            </View>
          )}
          <ErrorText>{error}</ErrorText>
          <Button title={`Add ${selected.name}`} variant="primary" block onPress={saveTargets} />
        </View>
      ) : (
        <View style={g.stack}>
          <Pressable onPress={() => setStep('list')}>
            <Text style={s.linkBack}>‹ Back to catalog</Text>
          </Pressable>
          <ExerciseFormFields value={customForm} onChange={setCustomForm} />
          <ErrorText>{error}</ErrorText>
          <Button title="Save exercise" variant="primary" block onPress={saveCustom} />
        </View>
      )}
    </Sheet>
  )
}

const s = StyleSheet.create({
  chipRow: { gap: sp[2], paddingVertical: sp[1] },
  chip: { paddingVertical: sp[2], paddingHorizontal: sp[3], minHeight: 36, borderRadius: radius.pill, backgroundColor: color.surface2, borderWidth: 1, borderColor: 'transparent', justifyContent: 'center' },
  chipActive: { backgroundColor: color.primarySoft, borderColor: color.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: color.textMuted },
  chipTextActive: { color: color.primary },
  linkBack: { color: color.textMuted, fontSize: 14 },
})
