import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { color, g, sp } from '@/theme'
import { Screen } from '@/components/Screen'
import { Sheet } from '@/components/Sheet'
import { Fab } from '@/components/Fab'
import { Button, ErrorText, Field, Spinner } from '@/components/ui'
import { ChevronRight, PlusIcon } from '@/components/icons'
import { useRoutines } from '@/hooks/useLocalData'
import { useSync } from '@/lib/sync'
import { useAuth } from '@/lib/auth'
import { createRoutine, getStore } from '@/db'
import type { TabScreenProps } from '@/navigation/types'

// Workout tab — the routines list (ported from apps/web WorkoutPage.tsx). Rows
// push the routine detail; the FAB / empty-state button open a "New workout day"
// sheet. Reads/writes the local store; a pull-to-refresh syncs.
export function WorkoutScreen({ navigation }: TabScreenProps<'Workout'>) {
  const { user } = useAuth()
  const { commit } = useSync()
  const { data: routines, isLoading } = useRoutines()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const openSheet = () => {
    setName('')
    setError('')
    setSheetOpen(true)
  }

  const onCreate = () => {
    if (!name.trim()) {
      setError('Workout day name is required')
      return
    }
    commit(() => createRoutine(getStore(), name.trim()))
    setName('')
    setSheetOpen(false)
  }

  const firstName = (user?.display_name || '').trim().split(/\s+/)[0]

  return (
    <Screen refreshable>
      <View style={s.intro}>
        <Text style={g.h2}>{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</Text>
        <Text style={[g.muted, { marginTop: 2 }]}>Pick a workout day to get training.</Text>
      </View>

      {isLoading ? <Spinner /> : null}

      {routines && routines.length > 0 ? (
        <>
          <Text style={g.sectionLabel}>Your workout days</Text>
          <View style={g.stack}>
            {routines.map((r) => (
              <Pressable key={r.id} style={[g.card, g.row]} onPress={() => navigation.navigate('RoutineDetail', { id: r.id })}>
                <View style={g.grow}>
                  <Text style={g.rowTitle}>{r.name}</Text>
                  {r.notes ? <Text style={g.rowSub}>{r.notes}</Text> : null}
                </View>
                <ChevronRight size={20} color={color.textFaint} />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {routines && routines.length === 0 && !isLoading ? (
        <View style={g.empty}>
          <Text style={g.emptyEmoji}>🏋️</Text>
          <Text style={g.emptyText}>No workout days yet.</Text>
          <Button title="Create workout day" variant="primary" onPress={openSheet} />
        </View>
      ) : null}

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="New workout day">
        <Field label="Workout day name" placeholder="Push Day" value={name} onChangeText={setName} autoFocus />
        <ErrorText>{error}</ErrorText>
        <Button title="Add workout day" variant="primary" block onPress={onCreate} />
      </Sheet>

      <Fab label="New workout day" onPress={openSheet} offset="tab">
        <PlusIcon color={color.primaryInk} size={26} />
      </Fab>
    </Screen>
  )
}

const s = StyleSheet.create({
  intro: { paddingVertical: sp[1] },
})
