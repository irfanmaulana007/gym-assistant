import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { color, g, sp } from '@/theme'
import { Screen } from '@/components/Screen'
import { Spinner } from '@/components/ui'
import { ChevronRight } from '@/components/icons'
import { useRoutines, useSessions } from '@/hooks/useLocalData'
import { formatDate, formatDuration } from '@/lib/format'
import { routinesById, sessionGroupLabel } from '@/lib/sessionGroup'
import { muscleGroupLabel, type WorkoutSession } from '@/types/api'
import type { TabScreenProps } from '@/navigation/types'

// History tab (ports apps/web SessionHistoryPage.tsx). Reads completed sessions
// from the local store; each row opens the summary (ActiveSession in history
// mode). Pull-to-refresh triggers a sync.
export function SessionHistoryScreen({ navigation }: TabScreenProps<'History'>) {
  const { data: sessions, isLoading } = useSessions()
  const { data: routines } = useRoutines()
  const byId = routinesById(routines)

  const completed = (sessions ?? [])
    .filter((s) => s.status === 'completed')
    .sort((a, b) => b.performed_at.localeCompare(a.performed_at))

  return (
    <Screen refreshable>
      <View>
        <Text style={g.h2}>History</Text>
        <Text style={[g.muted, { marginTop: 2 }]}>Every workout you've finished — tap one to see its summary.</Text>
      </View>

      {isLoading ? <Spinner /> : null}

      {!isLoading && completed.length === 0 ? (
        <View style={g.empty}>
          <Text style={g.emptyEmoji}>📅</Text>
          <Text style={g.emptyText}>No workouts yet.</Text>
          <Text style={[g.emptyText, g.small]}>Finish a workout to see it here.</Text>
        </View>
      ) : null}

      {completed.length > 0 ? (
        <View style={g.listGrouped}>
          {completed.map((session, i) => (
            <SessionRow
              key={session.id}
              session={session}
              groupLabel={sessionGroupLabel(session, byId)}
              divider={i > 0}
              onPress={() => navigation.navigate('ActiveSession', { id: session.id })}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  )
}

function SessionRow({
  session,
  groupLabel,
  divider,
  onPress,
}: {
  session: WorkoutSession
  groupLabel: string
  divider: boolean
  onPress: () => void
}) {
  return (
    <Pressable onPress={onPress} style={[g.navRow, divider && s.divider]}>
      <View style={g.grow}>
        <Text style={g.rowTitle}>{groupLabel}</Text>
        <View style={[g.row, g.wrap, { marginTop: 2 }]}>
          <Text style={g.muted}>{formatDate(session.performed_at)}</Text>
          <Text style={g.muted}>·</Text>
          <Text style={g.muted}>{formatDuration(session.active_duration_seconds ?? 0)} active</Text>
          {session.muscle_groups.slice(0, 4).map((grp) => (
            <View key={grp} style={g.badge}>
              <Text style={g.badgeText}>{muscleGroupLabel(grp)}</Text>
            </View>
          ))}
          {session.muscle_groups.length > 4 ? (
            <Text style={[g.muted, g.small]}>+{session.muscle_groups.length - 4}</Text>
          ) : null}
        </View>
      </View>
      <ChevronRight size={20} color={color.textFaint} />
    </Pressable>
  )
}

const s = StyleSheet.create({
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
})
