import React, { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SvgUri } from 'react-native-svg'
import { color, radius, sp } from '@/theme'
import { buildMuscleUsageDiagramUrl, type MuscleUsageStat } from '@/lib/muscleDiagram'

// anatome dual-view body SVG colored by how much each muscle group was trained
// (PRD 0011). Renders a note when nothing maps / the image fails. Mirrors
// apps/web MuscleUsageDiagram.tsx; the legend gradient is built from the four
// --muscle-usage tokens so it never drifts from the SVG tiers.
export function MuscleUsageDiagram({ groups }: { groups: MuscleUsageStat[] }) {
  const [failed, setFailed] = useState(false)
  const src = buildMuscleUsageDiagramUrl(groups)
  if (src == null || failed) {
    return <Text style={s.note}>No muscles trained in this window yet.</Text>
  }
  return (
    <View style={s.wrap}>
      <View style={s.figure}>
        <SvgUri uri={src} width="100%" height="100%" onError={() => setFailed(true)} />
      </View>
      <View style={s.legend}>
        <Text style={s.legendLabel}>Less</Text>
        <View style={s.bar}>
          {[color.muscleUsage1, color.muscleUsage2, color.muscleUsage3, color.muscleUsage4].map((c) => (
            <View key={c} style={[s.barSeg, { backgroundColor: c }]} />
          ))}
        </View>
        <Text style={s.legendLabel}>More</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', gap: sp[3] },
  figure: { width: '100%', maxWidth: 280, aspectRatio: 1, borderRadius: radius.base },
  note: { color: color.textMuted, fontSize: 13 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: sp[2], width: '100%', maxWidth: 280 },
  legendLabel: { fontSize: 13, color: color.textMuted },
  bar: { flex: 1, height: 8, borderRadius: radius.pill, overflow: 'hidden', flexDirection: 'row' },
  barSeg: { flex: 1, height: '100%' },
})
