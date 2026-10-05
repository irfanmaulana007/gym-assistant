import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { color, radius, shadow, sp } from '@/theme'

// iOS-style segmented control for in-page view switching (mirrors web Segmented).
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <View style={s.track} accessibilityRole="tablist">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.value)}
            style={[s.seg, active && s.segActive]}
          >
            <Text style={[s.segText, active && s.segTextActive]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  track: { flexDirection: 'row', gap: 2, padding: 3, backgroundColor: color.surface2, borderRadius: radius.base },
  seg: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: sp[2],
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segActive: { backgroundColor: color.surface, ...shadow.level1 },
  segText: { fontSize: 14, fontWeight: '600', color: color.textMuted },
  segTextActive: { color: color.text },
})
