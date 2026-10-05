import React from 'react'
import { StyleSheet, Switch as RNSwitch, Text, View } from 'react-native'
import { color, sp } from '@/theme'

// Native iOS-style labeled toggle (mirrors web Switch.tsx), themed with tokens.
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <RNSwitch
        value={checked}
        onValueChange={onChange}
        trackColor={{ false: color.surface2, true: color.primary }}
        thumbColor="#fff"
        ios_backgroundColor={color.surface2}
      />
    </View>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp[3], minHeight: 44 },
  label: { fontSize: 14, fontWeight: '600', color: color.textMuted },
})
