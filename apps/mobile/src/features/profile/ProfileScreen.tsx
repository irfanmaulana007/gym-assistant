import React, { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { color, g, sp } from '@/theme'
import { Screen } from '@/components/Screen'
import { Avatar } from '@/components/Avatar'
import { Segmented } from '@/components/Segmented'
import { Switch } from '@/components/Switch'
import { MuscleUsageDiagram } from '@/components/MuscleUsageDiagram'
import { Button, ErrorText, Spinner } from '@/components/ui'
import { ChevronRight, LogOutIcon } from '@/components/icons'
import { formatDate } from '@/lib/format'
import { formatWeight, formatHeight } from '@/lib/units'
import { ageFrom } from '@/lib/age'
import { useAuth } from '@/lib/auth'
import { getStore, META_MUSCLE_GROUPS } from '@/db'
import { analyticsApi } from '@/api/analytics'
import {
  ACTIVITY_LEVEL_LABELS,
  FITNESS_GOAL_LABELS,
  GENDER_LABELS,
  type DashboardWindow,
  type MuscleGroupsResult,
  type User,
} from '@/types/api'
import type { TabScreenProps } from '@/navigation/types'

// Matches the Progress dashboard's window control (PRD 0007) for consistency.
const WINDOW_OPTIONS: { value: DashboardWindow; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: '3M' },
  { value: 'all', label: 'All' },
]

// Server-derived read-only cache (PRD 0018 non-goal): shown from the last fetch
// when offline, refreshed on reconnect.
function useMuscleGroups(window: DashboardWindow) {
  return useQuery<MuscleGroupsResult>({
    queryKey: ['muscleGroups', window],
    queryFn: async () => {
      const data = await analyticsApi.muscleGroups(window)
      getStore().meta.set(META_MUSCLE_GROUPS(window), data)
      return data
    },
    initialData: () => getStore().meta.get<MuscleGroupsResult>(META_MUSCLE_GROUPS(window)),
  })
}

function MusclesTrained() {
  const [window, setWindow] = useState<DashboardWindow>('month')
  const [includeCardio, setIncludeCardio] = useState(false)
  const { data, isLoading, isError } = useMuscleGroups(window)

  const groups = data?.muscle_groups ?? []
  const hasCardio = groups.some((gr) => gr.muscle_group === 'cardio')
  const shown = includeCardio ? groups : groups.filter((gr) => gr.muscle_group !== 'cardio')

  return (
    <>
      <Text style={g.sectionLabel}>MUSCLES TRAINED</Text>
      <View style={[g.card, g.stack]}>
        <Segmented options={WINDOW_OPTIONS} value={window} onChange={setWindow} />
        {hasCardio ? <Switch label="Include cardio" checked={includeCardio} onChange={setIncludeCardio} /> : null}
        {isLoading && !data ? <Spinner /> : null}
        {isError && !data ? <ErrorText>Could not load your muscle activity.</ErrorText> : null}
        {data ? <MuscleUsageDiagram groups={shown} /> : null}
      </View>
    </>
  )
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.row, !last && g.listDivider]}>
      <Text style={g.detailLabel}>{label}</Text>
      <Text style={g.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

function healthRows(user: User): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  if (user.gender) rows.push({ label: 'Gender', value: GENDER_LABELS[user.gender] })
  const age = ageFrom(user.date_of_birth)
  if (age != null) rows.push({ label: 'Age', value: `${age}` })
  if (user.body_weight != null && user.body_weight_unit) {
    rows.push({ label: 'Weight', value: formatWeight(user.body_weight, user.body_weight_unit, user.preferred_weight_unit) })
  }
  if (user.height != null && user.height_unit) {
    rows.push({ label: 'Height', value: formatHeight(user.height, user.height_unit, user.preferred_height_unit) })
  }
  if (user.fitness_goal) rows.push({ label: 'Goal', value: FITNESS_GOAL_LABELS[user.fitness_goal] })
  if (user.activity_level) rows.push({ label: 'Activity', value: ACTIVITY_LEVEL_LABELS[user.activity_level] })
  return rows
}

// Full-screen account view (Profile tab, PRD 0005): identity, muscles-trained
// diagram, health + account in grouped inset lists, Edit / Change password /
// Logout (PRD 0008). Mirrors apps/web ProfilePage.tsx.
export function ProfileScreen({ navigation }: TabScreenProps<'Profile'>) {
  const { user, logout } = useAuth()
  if (!user) return null

  const name = user.display_name || user.email
  const account: { label: string; value: string }[] = []
  if (user.full_name) account.push({ label: 'Full name', value: user.full_name })
  account.push({ label: 'Email', value: user.email })
  account.push({ label: 'Member since', value: formatDate(user.created_at) })
  const health = healthRows(user)

  const confirmLogout = () =>
    Alert.alert('Log out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => logout() },
    ])

  return (
    <Screen refreshable>
      <View style={s.head}>
        <Avatar name={name} src={user.avatar_url} size="lg" />
        <Text style={s.name}>{user.display_name || 'Athlete'}</Text>
        {user.username ? <Text style={g.muted}>@{user.username}</Text> : null}
        <Text style={g.muted}>{user.email}</Text>
      </View>

      <MusclesTrained />

      {health.length > 0 ? (
        <>
          <Text style={g.sectionLabel}>HEALTH</Text>
          <View style={g.listGrouped}>
            {health.map((r, i) => (
              <DetailRow key={r.label} label={r.label} value={r.value} last={i === health.length - 1} />
            ))}
          </View>
        </>
      ) : null}

      <Text style={g.sectionLabel}>ACCOUNT</Text>
      <View style={g.listGrouped}>
        {account.map((r, i) => (
          <DetailRow key={r.label} label={r.label} value={r.value} last={i === account.length - 1} />
        ))}
      </View>

      <Text style={g.sectionLabel}>SETTINGS</Text>
      <View style={g.listGrouped}>
        <Pressable style={g.navRow} onPress={() => navigation.navigate('EditProfile')}>
          <Text style={[g.grow, g.rowTitle]}>Edit profile</Text>
          <ChevronRight size={20} color={color.textFaint} />
        </Pressable>
        <Pressable style={[g.navRow, g.listDivider]} onPress={() => navigation.navigate('ChangePassword')}>
          <Text style={[g.grow, g.rowTitle]}>Change password</Text>
          <ChevronRight size={20} color={color.textFaint} />
        </Pressable>
      </View>

      <Button title="Logout" variant="danger" block onPress={confirmLogout} icon={<LogOutIcon size={20} color={color.danger} />} />
    </Screen>
  )
}

const s = StyleSheet.create({
  head: { alignItems: 'center', gap: sp[1], paddingVertical: sp[4] },
  name: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: color.text, marginTop: sp[2] },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp[3], padding: sp[4], minHeight: 56 },
})
