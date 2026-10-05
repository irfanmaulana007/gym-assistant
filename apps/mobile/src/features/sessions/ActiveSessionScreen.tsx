import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { color, g, radius, sp } from '@/theme'
import { Screen } from '@/components/Screen'
import { Button, ErrorText, Spinner } from '@/components/ui'
import { Sheet } from '@/components/Sheet'
import { useRoutines, useSession } from '@/hooks/useLocalData'
import { useCachedUser } from '@/hooks/useLocalData'
import { useElapsed } from '@/hooks/useElapsed'
import { useSync } from '@/lib/sync'
import { getStore } from '@/db'
import { abandonSession, completeSession, pauseSession, resumeSession } from '@/db/repositories'
import { formatDuration } from '@/lib/format'
import { routinesById, sessionGroupLabel } from '@/lib/sessionGroup'
import { ExerciseCard } from './ExerciseCard'
import { SessionSummary } from './SessionSummary'
import { AddExerciseSheet } from './AddExerciseSheet'
import type { RootScreenProps } from '@/navigation/types'

// Active workout + summary (ports apps/web ActiveSessionPage.tsx). The same
// route renders the live logging UI (active/paused) and the completed summary
// (just-finished or reopened from History) — PRD 0015. All writes are local +
// outbox (offline-first); logging a set never blocks on the network.
export function ActiveSessionScreen({ route, navigation }: RootScreenProps<'ActiveSession'>) {
  const { id } = route.params
  const { commit } = useSync()
  const { data: session, isLoading } = useSession(id)
  const { data: routines } = useRoutines()
  const { data: user } = useCachedUser()
  const preferredUnit = user?.preferred_weight_unit ?? 'kg'

  const [addOpen, setAddOpen] = useState(false)
  const [stopOpen, setStopOpen] = useState(false)
  const [justFinished, setJustFinished] = useState(false)

  const running = session?.status === 'active'
  const paused = session?.status === 'paused'
  const elapsed = useElapsed(session?.started_at ?? null, running)

  const orderedExercises = useMemo(() => {
    const exercises = session?.exercises ?? []
    return [...exercises].sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'))
  }, [session?.exercises])

  const groupLabel = session ? sessionGroupLabel(session, routinesById(routines)) : 'Workout'
  const title = useMemo(() => {
    if (!session) return 'Workout'
    if (session.status === 'completed') return justFinished ? 'Workout complete' : groupLabel
    return 'Active workout'
  }, [session, justFinished, groupLabel])

  useLayoutEffect(() => {
    navigation.setOptions({ title })
  }, [navigation, title])

  // An abandoned session is never shown as a summary — leave.
  useEffect(() => {
    if (session?.status === 'abandoned') navigation.goBack()
  }, [session?.status, navigation])

  if (isLoading) return <Screen><Spinner /></Screen>
  if (!session) {
    return (
      <Screen>
        <ErrorText>Session not found.</ErrorText>
      </Screen>
    )
  }

  if (session.status === 'completed') {
    return (
      <Screen refreshable>
        <SessionSummary
          session={session}
          variant={justFinished ? 'complete' : 'history'}
          onDone={() => navigation.goBack()}
        />
      </Screen>
    )
  }
  if (session.status === 'abandoned') return <Screen><Spinner /></Screen>

  return (
    <Screen
      bottomCta={<Button variant="primary" block title="Add exercise" onPress={() => setAddOpen(true)} />}
    >
      <View style={s.bar}>
        <View style={g.row}>
          <View style={[s.dot, paused && s.dotPaused]} />
          <View>
            <Text style={[g.muted, g.small]}>{paused ? 'Paused' : 'Elapsed'}</Text>
            <Text style={s.timer}>{formatDuration(elapsed)}</Text>
          </View>
        </View>
        <View style={g.row}>
          {paused ? (
            <Button size="sm" variant="primary" title="Resume" onPress={() => commit(() => resumeSession(getStore(), id))} />
          ) : (
            <Button size="sm" variant="ghost" title="Pause" onPress={() => commit(() => pauseSession(getStore(), id))} />
          )}
          <Button size="sm" variant="danger" title="Stop" onPress={() => setStopOpen(true)} />
        </View>
      </View>

      <View style={{ gap: sp[3] }}>
        {orderedExercises.map((sx) => (
          <ExerciseCard key={sx.id} sx={sx} disabled={paused} preferredUnit={preferredUnit} />
        ))}
      </View>

      <AddExerciseSheet open={addOpen} onClose={() => setAddOpen(false)} sessionId={id} />

      <Sheet open={stopOpen} onClose={() => setStopOpen(false)} title="Finish workout?">
        <Text style={g.muted}>Save this workout to keep it in your history, or discard it if you didn't mean to stop.</Text>
        <Button
          variant="primary"
          block
          title="Save workout"
          onPress={() => {
            setStopOpen(false)
            setJustFinished(true)
            commit(() => completeSession(getStore(), id))
          }}
        />
        <Button
          variant="danger"
          block
          title="Discard workout"
          onPress={() => {
            setStopOpen(false)
            commit(() => abandonSession(getStore(), id))
            navigation.goBack()
          }}
        />
        <Button variant="ghost" block title="Keep going" onPress={() => setStopOpen(false)} />
      </Sheet>
    </Screen>
  )
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.base,
    paddingVertical: sp[3],
    paddingHorizontal: sp[4],
  },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: color.primary },
  dotPaused: { backgroundColor: color.textFaint },
  timer: { fontSize: 26, fontWeight: '700', color: color.text, fontVariant: ['tabular-nums'] },
})
