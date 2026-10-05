import React, { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { color, g, radius, sp } from '@/theme'
import { Sheet } from '@/components/Sheet'
import { Button, Field } from '@/components/ui'
import { Segmented } from '@/components/Segmented'
import { getStore } from '@/db'
import { newId } from '@/db/id'
import { useSync } from '@/lib/sync'
import { catalogApi } from '@/api/catalog'
import { isOnline } from '@/lib/netinfo'
import {
  MUSCLE_GROUPS,
  muscleGroupLabel,
  type CatalogExercise,
  type MeasurementType,
  type MuscleGroup,
  type SessionExercise,
} from '@/types/api'

// Add an ad-hoc exercise mid-session (PRD 0017). Offline-first: the row + an
// outbox 'session_exercise' create are written locally (via the inlined helper
// below) and replayed by the sync worker. A catalog search is a best-effort
// online convenience that prefills name/muscle group/measurement type.
function addSessionExercise(
  commit: ReturnType<typeof useSync>['commit'],
  sessionId: string,
  input: {
    name: string
    measurement_type: MeasurementType
    target_sets: number | null
    target_reps: number | null
    primary_muscle_group: MuscleGroup
    catalog_exercise_id?: string
  },
): void {
  commit(() => {
    const store = getStore()
    const id = newId()
    const position = store.sessionExercises.all().filter((se) => se.session_id === sessionId).length
    const now = new Date().toISOString()
    const row: SessionExercise = {
      id,
      session_id: sessionId,
      exercise_id: null,
      position,
      name_snapshot: input.name,
      measurement_type: input.measurement_type,
      target_sets: input.target_sets,
      target_reps: input.target_reps,
      target_weight: null,
      target_duration_seconds: null,
      primary_muscle_group: input.primary_muscle_group,
      secondary_muscle_groups: [],
      status: 'pending',
      completed_at: null,
      sets_completed: 0,
      total_reps: null,
      total_volume: null,
      total_duration_seconds: null,
      top_set_weight: null,
      metadata: {},
      entries: [],
      last_set: null,
    }
    store.sessionExercises.upsert(row)
    store.outbox.enqueue({
      id: newId(),
      entity: 'session_exercise',
      op: 'create',
      entity_id: id,
      payload: {
        session_id: sessionId,
        name: input.name,
        measurement_type: input.measurement_type,
        target_sets: input.target_sets,
        target_reps: input.target_reps,
        primary_muscle_group: input.primary_muscle_group,
        ...(input.catalog_exercise_id ? { catalog_exercise_id: input.catalog_exercise_id } : {}),
      },
      base_version: null,
      created_at: now,
      state: 'pending',
      attempts: 0,
      next_attempt_at: 0,
      last_error: null,
    })
  })
}

export function AddExerciseSheet({ open, onClose, sessionId }: { open: boolean; onClose: () => void; sessionId: string }) {
  const { commit } = useSync()
  const [name, setName] = useState('')
  const [measurement, setMeasurement] = useState<MeasurementType>('weight_reps')
  const [primary, setPrimary] = useState<MuscleGroup>('chest')
  const [sets, setSets] = useState('')
  const [reps, setReps] = useState('')
  const [catalogId, setCatalogId] = useState<string | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<CatalogExercise[]>([])

  useEffect(() => {
    if (!open) return
    if (search.trim().length < 2 || !isOnline()) {
      setResults([])
      return
    }
    let cancelled = false
    catalogApi
      .list({ search: search.trim() })
      .then((r) => {
        if (!cancelled) setResults(r.slice(0, 8))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [search, open])

  function reset() {
    setName('')
    setMeasurement('weight_reps')
    setPrimary('chest')
    setSets('')
    setReps('')
    setCatalogId(undefined)
    setSearch('')
    setResults([])
  }

  function pickCatalog(c: CatalogExercise) {
    setName(c.name)
    setMeasurement(c.default_measurement_type)
    setPrimary(c.primary_muscle_group)
    setCatalogId(c.id)
    setResults([])
    setSearch('')
  }

  function submit() {
    if (!name.trim()) return
    addSessionExercise(commit, sessionId, {
      name: name.trim(),
      measurement_type: measurement,
      target_sets: sets === '' ? null : Number(sets),
      target_reps: reps === '' ? null : Number(reps),
      primary_muscle_group: primary,
      catalog_exercise_id: catalogId,
    })
    reset()
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add exercise">
      <Field label="Search the catalog (optional)" value={search} onChangeText={setSearch} placeholder="e.g. Bench press" />
      {results.length > 0 ? (
        <View style={g.listGrouped}>
          {results.map((c, i) => (
            <Pressable key={c.id} onPress={() => pickCatalog(c)} style={[g.navRow, i > 0 && s.divider]}>
              <View style={g.grow}>
                <Text style={g.rowTitle}>{c.name}</Text>
                <Text style={g.rowSub}>{muscleGroupLabel(c.primary_muscle_group)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Field label="Name" value={name} onChangeText={(t) => { setName(t); setCatalogId(undefined) }} placeholder="Exercise name" />

      <View style={g.field}>
        <Text style={g.label}>Measurement</Text>
        <Segmented
          options={[
            { value: 'weight_reps', label: 'Weight × reps' },
            { value: 'duration', label: 'Duration' },
          ]}
          value={measurement}
          onChange={(v) => setMeasurement(v as MeasurementType)}
        />
      </View>

      <View style={g.field}>
        <Text style={g.label}>Primary muscle</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {MUSCLE_GROUPS.map((mg) => {
            const active = mg === primary
            return (
              <Pressable key={mg} onPress={() => setPrimary(mg as MuscleGroup)} style={[s.chip, active && s.chipActive]}>
                <Text style={[s.chipText, active && s.chipTextActive]}>{muscleGroupLabel(mg)}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {measurement === 'weight_reps' ? (
        <View style={g.row}>
          <View style={g.grow}>
            <Field label="Target sets" value={sets} onChangeText={setSets} keyboardType="number-pad" placeholder="4" />
          </View>
          <View style={g.grow}>
            <Field label="Target reps" value={reps} onChangeText={setReps} keyboardType="number-pad" placeholder="8" />
          </View>
        </View>
      ) : null}

      <Button variant="primary" block title="Add to workout" onPress={submit} />
    </Sheet>
  )
}

const s = StyleSheet.create({
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  chips: { gap: sp[2], paddingVertical: sp[1] },
  chip: { paddingVertical: sp[2], paddingHorizontal: sp[3], borderRadius: radius.pill, backgroundColor: color.surface2 },
  chipActive: { backgroundColor: color.primarySoft, borderWidth: 1, borderColor: color.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: color.textMuted },
  chipTextActive: { color: color.primary },
})
