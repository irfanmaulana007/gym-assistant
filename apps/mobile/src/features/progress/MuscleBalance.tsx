import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { color, radius, sp } from '@/theme'
import { formatDuration } from '@/lib/format'
import { muscleGroupLabel, type MuscleGroupStat } from '@/types/api'

// Sets-per-muscle-group bars with undertrained groups flagged (ported from
// apps/web MuscleBalance). Bar width is share-of-max sets. Cardio is summarized
// by duration since it's timed, not rep-based work.
function metricLabel(g: MuscleGroupStat): string {
  if (g.muscle_group === 'cardio') {
    const bouts = `${g.sets} cardio`
    return g.duration_seconds > 0 ? `${formatDuration(g.duration_seconds)} · ${bouts}` : bouts
  }
  return `${g.sets} sets · ${g.frequency}×`
}

export function MuscleBalance({ groups }: { groups: MuscleGroupStat[] }) {
  if (groups.length === 0) {
    return <Text style={s.empty}>No muscle groups trained in this window yet.</Text>
  }
  const max = Math.max(...groups.map((g) => g.sets), 1)
  return (
    <View style={{ gap: sp[3] }}>
      {groups.map((g) => (
        <View key={g.muscle_group} style={{ gap: sp[1] }}>
          <View style={s.rowBetween}>
            <View style={s.labelRow}>
              <Text style={s.name}>{muscleGroupLabel(g.muscle_group)}</Text>
              {g.undertrained ? (
                <View style={s.lowBadge}>
                  <Text style={s.lowBadgeText}>Low</Text>
                </View>
              ) : null}
            </View>
            <Text style={s.metric}>{metricLabel(g)}</Text>
          </View>
          <View style={s.track}>
            <View
              style={[
                s.fill,
                { width: `${Math.max((g.sets / max) * 100, 3)}%` },
                g.undertrained && { backgroundColor: color.danger },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  empty: { color: color.textMuted, fontSize: 13 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp[2] },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: sp[2] },
  name: { color: color.text, fontSize: 15 },
  metric: { color: color.textMuted, fontSize: 13 },
  lowBadge: { paddingVertical: 2, paddingHorizontal: sp[2], borderRadius: radius.pill, backgroundColor: color.dangerSoft },
  lowBadgeText: { fontSize: 12, fontWeight: '600', color: color.danger },
  track: { height: 8, backgroundColor: color.surface2, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: color.primary, borderRadius: radius.pill },
})
