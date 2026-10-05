import React, { useEffect, useLayoutEffect, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { color, g, sp } from '@/theme'
import { Screen } from '@/components/Screen'
import { Sheet } from '@/components/Sheet'
import { Fab } from '@/components/Fab'
import { Button, ErrorText, Field, Spinner } from '@/components/ui'
import { ChevronRight, PencilIcon, PlusIcon } from '@/components/icons'
import { useRoutine, useActiveSession } from '@/hooks/useLocalData'
import { useSync } from '@/lib/sync'
import {
  addExercise,
  deleteRoutine,
  getStore,
  startSession,
  updateRoutine,
  type ExerciseDraft,
} from '@/db'
import { muscleGroupLabel } from '@/types/api'
import { formatLastSet, formatTarget } from '@/lib/format'
import { ExercisePickerSheet } from './ExercisePickerSheet'
import type { RootScreenProps } from '@/navigation/types'

// Routine detail (ported from apps/web RoutineDetailPage.tsx): view/edit the
// routine, its ordered exercises, add exercises via the catalog picker, and a
// sticky "Start workout" CTA. Offline-first: all writes go to the local store;
// starting a session is instant. If a session is already live we offer Resume
// (there can be only one, matching the API's single-live-session rule).
export function RoutineDetailScreen({ route, navigation }: RootScreenProps<'RoutineDetail'>) {
  const { id } = route.params
  const { commit } = useSync()
  const { data: routine, isLoading } = useRoutine(id)
  const { data: active } = useActiveSession()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editError, setEditError] = useState('')

  useLayoutEffect(() => {
    if (routine) navigation.setOptions({ title: routine.name })
  }, [navigation, routine])

  useEffect(() => {
    if (routine) {
      setEditName(routine.name)
      setEditNotes(routine.notes)
    }
  }, [routine])

  if (isLoading) return <Screen><Spinner /></Screen>
  if (!routine) {
    return (
      <Screen>
        <ErrorText>Routine not found.</ErrorText>
      </Screen>
    )
  }

  const exercises = routine.exercises ?? []

  const onSaveRoutine = () => {
    if (!editName.trim()) {
      setEditError('Workout day name is required')
      return
    }
    commit(() => updateRoutine(getStore(), id, { name: editName.trim(), notes: editNotes.trim() }))
    setEditOpen(false)
  }

  const onDelete = () => {
    Alert.alert('Delete workout day', `Delete "${routine.name}"? Past sessions are kept.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          commit(() => deleteRoutine(getStore(), id))
          navigation.goBack()
        },
      },
    ])
  }

  const onAddExercise = (draft: ExerciseDraft) => {
    commit(() => addExercise(getStore(), id, draft))
  }

  const onStart = () => {
    const session = commit(() => startSession(getStore(), routine))
    navigation.navigate('ActiveSession', { id: session.id })
  }

  const startCta =
    active ? (
      <Button title="Resume current workout" variant="primary" block onPress={() => navigation.navigate('ActiveSession', { id: active.id })} />
    ) : (
      <Button title="Start workout" variant="primary" block disabled={exercises.length === 0} onPress={onStart} />
    )

  return (
    <Screen bottomCta={startCta}>
      <View style={s.actions}>
        {routine.notes ? <Text style={[g.muted, g.grow]}>{routine.notes}</Text> : <View style={g.grow} />}
        <Button title="Edit" size="sm" variant="ghost" icon={<PencilIcon size={18} color={color.text} />} onPress={() => { setEditError(''); setEditOpen(true) }} />
      </View>

      {exercises.length > 0 ? (
        <>
          <Text style={g.sectionLabel}>Exercises</Text>
          <View style={g.stack}>
            {exercises.map((ex) => (
              <Pressable key={ex.id} style={[g.card, g.row]} onPress={() => navigation.navigate('ExerciseHistory', { id: ex.id })}>
                <View style={g.grow}>
                  <Text style={g.rowTitle}>{ex.name}</Text>
                  <View style={[g.row, g.wrap, { gap: sp[2], marginTop: 2 }]}>
                    <Text style={g.muted}>{formatTarget(ex.measurement_type, ex.target_sets, ex.target_reps, ex.target_duration_seconds)}</Text>
                    <View style={g.badge}>
                      <Text style={g.badgeText}>{muscleGroupLabel(ex.primary_muscle_group)}</Text>
                    </View>
                    {ex.last_set ? <Text style={g.muted}>Last {formatLastSet(ex.last_set)}</Text> : null}
                  </View>
                </View>
                <ChevronRight size={20} color={color.textFaint} />
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <View style={g.empty}>
          <Text style={g.emptyEmoji}>💪</Text>
          <Text style={g.emptyText}>No exercises yet.</Text>
          <Button title="Add your first exercise" variant="primary" onPress={() => setPickerOpen(true)} />
        </View>
      )}

      <ExercisePickerSheet open={pickerOpen} onClose={() => setPickerOpen(false)} onAdd={onAddExercise} />

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit workout day">
        <Field label="Workout day name" placeholder="Push Day" value={editName} onChangeText={setEditName} />
        <Field label="Notes" placeholder="Optional" value={editNotes} onChangeText={setEditNotes} />
        <ErrorText>{editError}</ErrorText>
        <Button title="Save changes" variant="primary" block onPress={onSaveRoutine} />
        <Button title="Delete workout day" variant="danger" block onPress={onDelete} />
      </Sheet>

      <Fab label="Add exercise" onPress={() => setPickerOpen(true)} offset="cta">
        <PlusIcon color={color.primaryInk} size={26} />
      </Fab>
    </Screen>
  )
}

const s = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: sp[3] },
})
