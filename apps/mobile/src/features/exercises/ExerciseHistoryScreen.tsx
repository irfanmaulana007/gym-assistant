import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Screen } from '@/components/Screen'
import { Button, Spinner } from '@/components/ui'
import { Segmented } from '@/components/Segmented'
import { Collapsible } from '@/components/Collapsible'
import { MuscleDiagram } from '@/components/MuscleDiagram'
import { PencilIcon } from '@/components/icons'
import { color, g, radius, sp } from '@/theme'
import { getStore } from '@/db'
import { describeTarget, formatDate } from '@/lib/format'
import { muscleGroupLabel } from '@/types/api'
import type { MeasurementType } from '@/types/api'
import type { RootScreenProps } from '@/navigation/types'
import { deriveExerciseHistory, type LocalHistorySession } from './exerciseHistoryLocal'
import { ExerciseEditSheet } from './ExerciseEditSheet'

type DetailTab = 'info' | 'progress' | 'history'
const TABS: { value: DetailTab; label: string }[] = [
  { value: 'info', label: 'Info' },
  { value: 'progress', label: 'Progress' },
  { value: 'history', label: 'History' },
]
const MEASUREMENT_LABELS: Record<MeasurementType, string> = {
  weight_reps: 'Weight × reps',
  reps_only: 'Reps only',
  duration: 'Duration',
  distance: 'Distance',
}
const TREND_LABEL: Record<string, string> = {
  up: '▲ Improving',
  down: '▼ Down',
  flat: '▬ Holding',
  none: 'Not enough data yet',
}

// Exercise detail (PRD 0009 / web ExerciseHistoryPage). Offline-first: Info +
// History + trend are derived from the local store (exerciseHistoryLocal), so
// the screen works with no connection.
export function ExerciseHistoryScreen({ route, navigation }: RootScreenProps<'ExerciseHistory'>) {
  const { id } = route.params
  const [tab, setTab] = useState<DetailTab>('info')
  const [editOpen, setEditOpen] = useState(false)

  const { data } = useQuery({
    queryKey: ['exercise-history', id],
    queryFn: async () => deriveExerciseHistory(getStore(), id),
  })

  const exercise = data?.exercise
  useLayoutEffect(() => {
    if (exercise) navigation.setOptions({ title: exercise.name })
  }, [exercise, navigation])

  if (!data) return <Screen><Spinner /></Screen>
  if (!exercise) {
    return (
      <Screen>
        <Text style={g.muted}>Could not load this exercise.</Text>
      </Screen>
    )
  }

  const { sessions, trend } = data
  const showChange = trend.direction === 'up' || trend.direction === 'down'

  return (
    <Screen refreshable>
      <View style={styles.actions}>
        <Button title="Edit" size="sm" variant="ghost" icon={<PencilIcon size={18} color={color.text} />} onPress={() => setEditOpen(true)} />
      </View>

      <Segmented options={TABS} value={tab} onChange={setTab} />

      {tab === 'info' ? (
        <View style={g.stack}>
          <Text style={g.sectionLabel}>Muscles worked</Text>
          <View style={[g.card, g.stack]}>
            <MuscleDiagram primary={exercise.primary_muscle_group} secondary={exercise.secondary_muscle_groups} />
            <View style={styles.badges}>
              <View style={[g.badge, g.badgeActive]}>
                <Text style={g.badgeActiveText}>{muscleGroupLabel(exercise.primary_muscle_group)}</Text>
              </View>
              {exercise.secondary_muscle_groups.map((grp) => (
                <View key={grp} style={g.badge}>
                  <Text style={g.badgeText}>{muscleGroupLabel(grp)}</Text>
                </View>
              ))}
            </View>
            <Text style={[g.muted, g.small]}>
              Primary{exercise.secondary_muscle_groups.length > 0 ? ' · secondary' : ''}
            </Text>
          </View>

          <Text style={g.sectionLabel}>Details</Text>
          <View style={g.listGrouped}>
            <Row label="Measurement" value={MEASUREMENT_LABELS[exercise.measurement_type]} />
            <Row label="Target" value={describeTarget(exercise)} divider />
            <Row
              label="Source"
              value={exercise.catalog_exercise_id != null ? `Catalog${exercise.catalog_name ? `: ${exercise.catalog_name}` : ''}` : 'Custom'}
              divider
            />
          </View>

          {exercise.notes.trim() ? (
            <>
              <Text style={g.sectionLabel}>Notes</Text>
              <View style={g.card}>
                <Text style={g.body}>{exercise.notes}</Text>
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      {tab === 'progress' ? (
        <View style={g.stack}>
          <View style={[g.card, g.rowBetween]}>
            <View>
              <Text style={[g.sectionLabel, { paddingHorizontal: 0 }]}>Progression</Text>
              <Text style={styles.trend}>{TREND_LABEL[trend.direction] ?? trend.direction}</Text>
            </View>
            {showChange ? (
              <Text style={[styles.change, { color: trend.direction === 'up' ? color.primary : color.danger }]}>
                {trend.change > 0 ? '+' : ''}
                {trend.change} kg
              </Text>
            ) : null}
          </View>
          <TopSetChart sessions={sessions} />
        </View>
      ) : null}

      {tab === 'history' ? (
        <View style={g.stack}>
          {sessions.length === 0 ? (
            <View style={g.empty}>
              <Text style={g.emptyEmoji}>📈</Text>
              <Text style={g.emptyText}>No logged sessions yet.</Text>
              <Text style={[g.muted, g.small]}>Log this exercise in a workout to see your history.</Text>
            </View>
          ) : (
            [...sessions].reverse().map((sesh) => <HistoryRow key={sesh.session_id} session={sesh} />)
          )}
        </View>
      ) : null}

      <ExerciseEditSheet
        exercise={exercise}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onDeleted={() => {
          setEditOpen(false)
          navigation.goBack()
        }}
      />
    </Screen>
  )
}

function Row({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  return (
    <View style={[g.detailRow, divider && g.listDivider]}>
      <Text style={g.detailLabel}>{label}</Text>
      <Text style={g.detailValue}>{value}</Text>
    </View>
  )
}

function HistoryRow({ session }: { session: LocalHistorySession }) {
  const unit = session.top_set?.weight_unit ?? ''
  const summary = (
    <View>
      <View style={g.rowBetween}>
        <Text style={g.muted}>{formatDate(session.performed_at)}</Text>
        {session.top_set ? (
          <Text style={styles.topSet}>
            {session.top_set.weight}
            {session.top_set.weight_unit} × {session.top_set.reps}
          </Text>
        ) : (
          <Text style={g.muted}>—</Text>
        )}
      </View>
      <Text style={g.rowSub}>
        Volume {session.total_volume.toLocaleString()} · {session.sets.length} sets
      </Text>
    </View>
  )
  return (
    <View style={styles.card}>
      {session.sets.length > 0 ? (
        <Collapsible summary={summary}>
          {session.sets.map((set) => (
            <View key={set.set_number} style={styles.entry}>
              <Text style={g.muted}>Set {set.set_number}</Text>
              <Text style={styles.entryVal}>
                {set.weight ?? '—'}
                {set.weight != null ? unit : ''} × {set.reps ?? '—'}
              </Text>
            </View>
          ))}
        </Collapsible>
      ) : (
        summary
      )}
    </View>
  )
}

// Dependency-free top-set bar chart (token-sourced), mirroring web's simple
// progression visual.
function TopSetChart({ sessions }: { sessions: LocalHistorySession[] }) {
  const points = useMemo(() => sessions.filter((s) => s.top_set).slice(-12), [sessions])
  if (points.length < 2) {
    return <Text style={[g.muted, g.small]}>Log at least two sessions to see your progression.</Text>
  }
  const max = Math.max(...points.map((p) => p.top_set!.weight))
  return (
    <View style={[g.card]}>
      <View style={styles.chart}>
        {points.map((p) => (
          <View key={p.session_id} style={styles.barCol}>
            <Text style={styles.barValue}>{p.top_set!.weight}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { height: `${Math.max(4, (p.top_set!.weight / max) * 100)}%` }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: sp[2] },
  trend: { fontSize: 18, fontWeight: '700', color: color.text },
  change: { fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  card: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: radius.base, padding: sp[4] },
  topSet: { fontWeight: '700', color: color.text },
  entry: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: sp[2],
    paddingHorizontal: sp[3],
    backgroundColor: color.bgElevated,
    borderRadius: radius.sm,
  },
  entryVal: { fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'] },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: sp[2], height: 140 },
  barCol: { flex: 1, alignItems: 'center', gap: sp[1], height: '100%', justifyContent: 'flex-end' },
  barValue: { fontSize: 11, color: color.textMuted, fontVariant: ['tabular-nums'] },
  barTrack: { width: '100%', height: 100, justifyContent: 'flex-end' },
  barFill: { width: '100%', backgroundColor: color.primary, borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm, minHeight: 2 },
})
