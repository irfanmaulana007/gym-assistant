import React, { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SvgUri } from 'react-native-svg'
import { color, radius, sp } from '@/theme'
import { buildMuscleDiagramUrl } from '@/lib/muscleDiagram'
import type { MuscleGroup } from '@/types/api'

// anatome raw muscle-diagram SVG for an exercise (PRD 0009), rendered with
// react-native-svg's SvgUri. Additive on top of the text badges: if nothing maps
// or the SVG fails to load, this renders nothing and the badges remain the
// source of truth — identical semantics to apps/web MuscleDiagram.tsx.
export function MuscleDiagram({ primary, secondary }: { primary: MuscleGroup; secondary: readonly MuscleGroup[] }) {
  const [failed, setFailed] = useState(false)
  const src = buildMuscleDiagramUrl(primary, secondary)
  if (src == null || failed) return null
  return (
    <View style={s.wrap}>
      <View style={s.figure}>
        <SvgUri uri={src} width="100%" height="100%" onError={() => setFailed(true)} />
      </View>
      <View style={s.legend}>
        <View style={s.item}>
          <View style={[s.swatch, { backgroundColor: color.musclePrimary }]} />
          <Text style={s.legendText}>Primary</Text>
        </View>
        {secondary.length > 0 ? (
          <View style={s.item}>
            <View style={[s.swatch, { backgroundColor: color.muscleSecondary }]} />
            <Text style={s.legendText}>Secondary</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', gap: sp[3] },
  figure: { width: '100%', maxWidth: 280, aspectRatio: 1, borderRadius: radius.base },
  legend: { flexDirection: 'row', gap: sp[4] },
  item: { flexDirection: 'row', alignItems: 'center', gap: sp[2] },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontSize: 13, color: color.textMuted },
})
