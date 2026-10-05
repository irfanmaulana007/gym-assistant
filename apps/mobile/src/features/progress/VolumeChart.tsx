import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { color, radius, sp } from '@/theme'
import type { VolumePoint } from '@/types/api'

// Compact, dependency-free volume bar chart (ported from apps/web VolumeChart).
// One series built from tokens; scrolls horizontally when there are many buckets
// so the page body never scrolls sideways.
export function VolumeChart({ points, unit, bucket }: { points: VolumePoint[]; unit: string; bucket: string }) {
  if (points.length === 0) {
    return <Text style={s.empty}>No volume logged in this window yet.</Text>
  }
  const max = Math.max(...points.map((p) => p.volume), 1)
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={s.chart}>
        {points.map((p) => {
          const pct = Math.max((p.volume / max) * 100, p.volume > 0 ? 4 : 0)
          return (
            <View style={s.col} key={p.bucket_start}>
              <Text style={s.value}>{compact(p.volume)}</Text>
              <View style={s.track}>
                <View style={[s.fill, { height: `${pct}%` }]} />
              </View>
              <Text style={s.label} numberOfLines={1}>
                {labelFor(p.bucket_start, bucket)}
              </Text>
            </View>
          )
        })}
      </View>
    </ScrollView>
  )
}

function labelFor(iso: string, bucket: string): string {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1, d ?? 1)
  if (bucket === 'month') return date.toLocaleDateString(undefined, { month: 'short' })
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(Math.round(n))
}

const s = StyleSheet.create({
  empty: { color: color.textMuted, fontSize: 13 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: sp[2], minHeight: 140 },
  col: { alignItems: 'center', gap: sp[1], width: 40 },
  value: { fontSize: 11, color: color.textMuted, fontVariant: ['tabular-nums'] },
  track: { height: 100, width: '100%', justifyContent: 'flex-end' },
  fill: {
    width: '100%',
    minHeight: 2,
    backgroundColor: color.primary,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
  },
  label: { fontSize: 11, color: color.textFaint },
})
