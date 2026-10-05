import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Screen } from '@/components/Screen'
import { Segmented } from '@/components/Segmented'
import { Spinner } from '@/components/ui'
import { ChevronRight } from '@/components/icons'
import { color, g, radius, sp } from '@/theme'
import { analyticsApi } from '@/api/analytics'
import { getStore, META_DASHBOARD } from '@/db'
import type {
  AnalyticsSummary,
  Dashboard,
  DashboardWindow,
  ExerciseTrend,
  Metric,
  PersonalRecord,
} from '@/types/api'
import type { TabScreenProps } from '@/navigation/types'
import { VolumeChart } from './VolumeChart'
import { MuscleBalance } from './MuscleBalance'
import { ActivityCalendar } from './ActivityCalendar'

const WINDOW_OPTIONS: { value: DashboardWindow; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: '3M' },
  { value: 'all', label: 'All' },
]

// Progress tab (landing). Analytics is server-derived and read-only cached
// offline (PRD 0018 non-goal): the live fetch caches into the local store meta,
// and seeds initialData from it so the screen renders the last successful fetch
// with no connection.
export function DashboardScreen({ navigation }: TabScreenProps<'Progress'>) {
  const [window, setWindow] = useState<DashboardWindow>('month')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', window],
    queryFn: async () => {
      const result = await analyticsApi.dashboard(window)
      getStore().meta.set(META_DASHBOARD(window), result)
      return result
    },
    initialData: () => getStore().meta.get<Dashboard>(META_DASHBOARD(window)),
    retry: 0,
    networkMode: 'always',
  })

  const openExercise = (id: string) => navigation.navigate('ExerciseHistory', { id })
  const stale = isError && data != null

  return (
    <Screen refreshable>
      <View style={g.stack}>
        <View>
          <Text style={g.h2}>Progress</Text>
          <Text style={[g.muted, { marginTop: 2 }]}>Are you overloading, consistent, and in balance?</Text>
        </View>

        <Segmented options={WINDOW_OPTIONS} value={window} onChange={setWindow} />

        {isLoading && !data ? <Spinner /> : null}
        {isError && !data ? <Text style={s.errorText}>Could not load your progress.</Text> : null}
        {stale ? <Text style={[g.muted, g.small]}>Showing your last synced progress.</Text> : null}

        {data ? (
          data.summary.workouts.value === 0 && data.summary.longest_streak === 0 ? (
            <View style={g.empty}>
              <Text style={g.emptyEmoji}>📊</Text>
              <Text style={g.emptyText}>No progress yet.</Text>
              <Text style={[g.emptyText, g.small]}>Finish your first workout to see your progress here.</Text>
            </View>
          ) : (
            <View style={g.stack}>
              <SummaryTiles data={data.summary} unit={data.volume_unit} />

              <Section label={`Volume trend (${data.volume_unit})`}>
                <View style={g.card}>
                  <VolumeChart points={data.volume_series} unit={data.volume_unit} bucket={data.window.bucket} />
                </View>
              </Section>

              {data.trending_up.length > 0 || data.stalled.length > 0 ? (
                <Section label="Progress signals">
                  {data.trending_up.length > 0 ? (
                    <View style={g.listGrouped}>
                      {data.trending_up.map((t, i) => (
                        <TrendRow key={t.exercise_id} trend={t} unit={data.volume_unit} kind="up" first={i === 0} onPress={() => openExercise(t.exercise_id)} />
                      ))}
                    </View>
                  ) : null}
                  {data.stalled.length > 0 ? (
                    <>
                      <Text style={g.sectionLabel}>Needs a push ⚠️</Text>
                      <View style={g.listGrouped}>
                        {data.stalled.map((t, i) => (
                          <TrendRow key={t.exercise_id} trend={t} unit={data.volume_unit} kind="stalled" first={i === 0} onPress={() => openExercise(t.exercise_id)} />
                        ))}
                      </View>
                    </>
                  ) : null}
                </Section>
              ) : null}

              {data.records.length > 0 ? (
                <Section label="Personal records">
                  <View style={g.listGrouped}>
                    {data.records.map((r, i) => (
                      <RecordRow key={r.exercise_id} record={r} unit={data.volume_unit} first={i === 0} onPress={() => openExercise(r.exercise_id)} />
                    ))}
                  </View>
                </Section>
              ) : null}

              <Section label="Muscle-group balance">
                <View style={g.card}>
                  <MuscleBalance groups={data.muscle_groups} />
                </View>
              </Section>

              <Section label="Activity">
                <View style={g.card}>
                  <ActivityCalendar days={data.calendar} from={data.window.from} />
                </View>
              </Section>
            </View>
          )
        ) : null}
      </View>
    </Screen>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={g.stack}>
      <Text style={g.sectionLabel}>{label}</Text>
      {children}
    </View>
  )
}

function SummaryTiles({ data, unit }: { data: AnalyticsSummary; unit: string }) {
  return (
    <View style={g.statGrid}>
      <StatTile value={Math.round(data.workouts.value).toLocaleString()} label="Workouts" metric={data.workouts} />
      <StatTile value={formatMinutes(data.training_minutes.value)} label="Training time" metric={data.training_minutes} />
      <StatTile value={compact(data.total_volume.value)} valueUnit={unit} label="Total volume" metric={data.total_volume} />
      <StatTile value={String(data.current_streak)} valueUnit="wk" label="Current streak" sub={`best ${data.longest_streak} wk`} />
    </View>
  )
}

function StatTile({
  value,
  valueUnit,
  label,
  metric,
  sub,
}: {
  value: string
  valueUnit?: string
  label: string
  metric?: Metric
  sub?: string
}) {
  return (
    <View style={[g.stat, s.tile]}>
      <Text style={g.statValue}>
        {value}
        {valueUnit ? <Text style={s.unit}> {valueUnit}</Text> : null}
      </Text>
      <Text style={g.statLabel}>
        {label}
        {metric?.delta_pct != null ? (
          <Text style={[s.delta, metric.delta_pct >= 0 ? s.deltaUp : s.deltaDown]}>
            {'  '}
            {metric.delta_pct >= 0 ? '▲' : '▼'} {Math.abs(metric.delta_pct)}%
          </Text>
        ) : null}
        {sub ? <Text style={s.statSub}> · {sub}</Text> : null}
      </Text>
    </View>
  )
}

function TrendRow({
  trend,
  unit,
  kind,
  first,
  onPress,
}: {
  trend: ExerciseTrend
  unit: string
  kind: 'up' | 'stalled'
  first: boolean
  onPress: () => void
}) {
  return (
    <Pressable style={[g.navRow, !first && s.divider]} onPress={onPress}>
      <Text style={[s.mark, kind === 'up' ? { color: color.primary } : { color: color.danger }]}>
        {kind === 'up' ? '▲' : '⚠️'}
      </Text>
      <View style={g.grow}>
        <Text style={g.rowTitle}>{trend.name}</Text>
        <Text style={g.rowSub}>
          {kind === 'up' ? `+${trend.change} ${unit} last session` : `No new high in ${trend.sessions} sessions`}
        </Text>
      </View>
      <ChevronRight size={20} color={color.textFaint} />
    </Pressable>
  )
}

function RecordRow({ record, unit, first, onPress }: { record: PersonalRecord; unit: string; first: boolean; onPress: () => void }) {
  return (
    <Pressable style={[g.navRow, !first && s.divider]} onPress={onPress}>
      <View style={g.grow}>
        <View style={s.recordTitle}>
          <Text style={g.rowTitle}>{record.name}</Text>
          {record.is_new_this_window ? (
            <View style={[g.badge, g.badgeActive]}>
              <Text style={[g.badgeText, g.badgeActiveText]}>New PR ✨</Text>
            </View>
          ) : null}
        </View>
        <Text style={g.rowSub}>
          {record.heaviest_weight}
          {unit} × {record.heaviest_reps} · est 1RM {record.est_one_rm}
          {unit}
        </Text>
      </View>
      <ChevronRight size={20} color={color.textFaint} />
    </Pressable>
  )
}

function formatMinutes(minutes: number): string {
  const m = Math.round(minutes)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`
}

function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(Math.round(n))
}

const s = StyleSheet.create({
  errorText: { color: color.danger, fontSize: 14 },
  tile: { flexGrow: 1, flexBasis: '47%' },
  unit: { fontSize: 13, fontWeight: '600', color: color.textMuted },
  delta: { fontSize: 12, fontWeight: '700' },
  deltaUp: { color: color.primary },
  deltaDown: { color: color.danger },
  statSub: { color: color.textFaint },
  mark: { width: 20, textAlign: 'center' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  recordTitle: { flexDirection: 'row', alignItems: 'center', gap: sp[2], flexWrap: 'wrap' },
})
