import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { color, layout, radius, shadow, sp } from '@/theme'
import { formatDuration } from '@/lib/format'
import { useActiveSession } from '@/hooks/useLocalData'
import { useElapsed } from '@/hooks/useElapsed'
import { useSync } from '@/lib/sync'
import { ChevronRight } from './icons'
import type { RootStackParamList } from '@/navigation/types'

// Persistent "resume workout" pill over the tab bar whenever a session is live
// (mirrors web ResumeSessionBanner.tsx). Tapping it pushes the session. Carries
// a subtle sync marker (PRD 0018 §4.5 — sync status in the UI). It is covered
// naturally when the ActiveSession screen is pushed on top.
export function ResumeSessionBanner() {
  const { data: session } = useActiveSession()
  const { status } = useSync()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()

  const paused = session?.status === 'paused'
  const elapsed = useElapsed(session?.started_at ?? null, session?.status === 'active')
  if (!session) return null

  const bottom = layout.bottomNavH + insets.bottom + sp[3]
  const pending = status.pending > 0 || status.phase === 'offline'

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Resume your active workout"
      onPress={() => navigation.navigate('ActiveSession', { id: session.id })}
      style={[s.bar, { bottom }]}
    >
      <View style={[s.dot, paused && s.dotPaused]} />
      <View style={s.grow}>
        <Text style={s.title}>{paused ? 'Workout paused' : 'Workout in progress'}</Text>
        <Text style={s.sub}>{pending ? 'Saved on device · will sync' : 'Tap to save or discard'}</Text>
      </View>
      <Text style={s.time}>{paused ? 'Paused' : formatDuration(elapsed)}</Text>
      <ChevronRight size={20} color={color.textFaint} />
    </Pressable>
  )
}

const s = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: sp[4],
    right: sp[4],
    maxWidth: layout.maxWidth - sp[4] * 2,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp[3],
    paddingVertical: sp[3],
    paddingLeft: sp[4],
    paddingRight: sp[3],
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: radius.base,
    ...shadow.menu,
  },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: color.primary },
  dotPaused: { backgroundColor: color.textFaint },
  grow: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: color.text },
  sub: { fontSize: 13, color: color.textMuted, marginTop: 2 },
  time: { fontWeight: '700', color: color.primary, fontVariant: ['tabular-nums'] },
})
