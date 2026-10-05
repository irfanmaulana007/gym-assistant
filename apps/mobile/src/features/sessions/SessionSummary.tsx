import React, { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { color, g, sp } from '@/theme'
import { Button } from '@/components/ui'
import { Collapsible } from '@/components/Collapsible'
import { Switch } from '@/components/Switch'
import { MuscleUsageDiagram } from '@/components/MuscleUsageDiagram'
import { formatDate, formatDuration } from '@/lib/format'
import { isCardioExercise, sessionMuscleUsage } from '@/lib/sessionMuscles'
import { muscleGroupLabel, type SessionExercise, type WorkoutSession } from '@/types/api'

// Post-workout summary (ports apps/web SessionSummary.tsx). Two surfaces share
// this on the ActiveSession route (PRD 0015): 'complete' (celebratory + Done
// CTA) and 'history' (quiet date line).
export function SessionSummary({
  session,
  variant = 'complete',
  onDone,
}: {
  session: WorkoutSession
  variant?: 'complete' | 'history'
  onDone?: () => void
}) {
  const exercises = session.exercises ?? []
  const totalSets = exercises.reduce((n, e) => n + (e.sets_completed ?? 0), 0)
  const totalVolume = exercises.reduce((n, e) => n + (e.total_volume ?? 0), 0)
  const timedSeconds = exercises.reduce((n, e) => n + (e.total_duration_seconds ?? 0), 0)

  const hasCardio = exercises.some(isCardioExercise)
  const [includeCardio, setIncludeCardio] = useState(false)
  const muscleUsage = sessionMuscleUsage(session, { includeCardio })

  return (
    <View style={{ gap: sp[4] }}>
      {variant === 'complete' ? (
        <View style={s.introCenter}>
          <Text style={g.h2}>Nice work! 🎉</Text>
          <Text style={g.muted}>Here's how your session went.</Text>
        </View>
      ) : (
        <Text style={g.muted}>{formatDate(session.performed_at)}</Text>
      )}

      <View style={g.statGrid}>
        <Stat value={formatDuration(session.active_duration_seconds ?? 0)} label="Active time" />
        <Stat value={formatDuration(session.total_duration_seconds ?? 0)} label="Total time" />
        <Stat value={String(totalSets)} label="Sets logged" />
        <Stat value={`${totalVolume.toLocaleString()} kg`} label="Total volume" />
        {timedSeconds > 0 ? <Stat value={formatDuration(timedSeconds)} label="Timed work" /> : null}
        <Stat value={formatDuration(session.paused_duration_seconds ?? 0)} label="Rested" />
      </View>

      <View style={[g.card, { gap: sp[3] }]}>
        <Text style={g.sectionLabel}>Muscle groups worked</Text>
        {hasCardio ? <Switch label="Include cardio" checked={includeCardio} onChange={setIncludeCardio} /> : null}
        <MuscleUsageDiagram groups={muscleUsage} />
        <View style={[g.row, g.wrap]}>
          {session.muscle_groups.length > 0 ? (
            session.muscle_groups.map((grp) => (
              <View key={grp} style={[g.badge, g.badgeActive]}>
                <Text style={[g.badgeText, g.badgeActiveText]}>{muscleGroupLabel(grp)}</Text>
              </View>
            ))
          ) : (
            <Text style={g.muted}>—</Text>
          )}
        </View>
      </View>

      <View style={[g.card, { gap: sp[3] }]}>
        <Text style={g.sectionLabel}>Exercises</Text>
        {exercises.map((e) => (
          <SummaryExerciseRow key={e.id} exercise={e} />
        ))}
      </View>

      {variant === 'complete' ? <Button variant="primary" block title="Done" onPress={() => onDone?.()} /> : null}
    </View>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={[g.stat, { flexBasis: '47%', flexGrow: 1 }]}>
      <Text style={g.statValue}>{value}</Text>
      <Text style={g.statLabel}>{label}</Text>
    </View>
  )
}

function SummaryExerciseRow({ exercise }: { exercise: SessionExercise }) {
  const entries = exercise.entries ?? []
  const summary = (
    <View style={s.summaryRow}>
      <Text style={g.grow}>{exercise.name_snapshot}</Text>
      <Text style={[g.muted, g.small]}>
        {exercise.sets_completed} set{exercise.sets_completed === 1 ? '' : 's'}
        {exercise.top_set_weight != null ? ` · top ${exercise.top_set_weight}kg` : ''}
      </Text>
    </View>
  )
  if (entries.length === 0) return <View style={{ paddingLeft: 20 + sp[2] }}>{summary}</View>
  return (
    <Collapsible summary={summary}>
      {entries.map((entry) => (
        <View key={entry.id} style={s.entryRow}>
          <Text style={{ color: color.textMuted, fontSize: 14 }}>Set {entry.entry_number}</Text>
          <Text style={{ fontWeight: '600', color: color.text, fontSize: 14 }}>
            {entry.duration_seconds != null
              ? formatDuration(entry.duration_seconds)
              : `${entry.weight ?? '—'}${entry.weight_unit ?? ''} × ${entry.reps ?? '—'}`}
          </Text>
        </View>
      ))}
    </Collapsible>
  )
}

const s = StyleSheet.create({
  introCenter: { alignItems: 'center', gap: sp[1] },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp[3] },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: sp[2],
    paddingHorizontal: sp[3],
    backgroundColor: color.bgElevated,
    borderRadius: 8,
  },
})
