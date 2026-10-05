import React, { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { color, sp } from '@/theme'
import { ChevronRight } from './icons'

// Native disclosure row (mirrors web Collapsible.tsx): a tappable header with a
// rotating chevron that reveals per-set detail without pushing a screen.
export function Collapsible({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <View>
      <Pressable style={s.header} accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)}>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <ChevronRight size={20} color={color.textFaint} />
        </View>
        <View style={s.summary}>{summary}</View>
      </Pressable>
      {open ? <View style={s.body}>{children}</View> : null}
    </View>
  )
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: sp[2] },
  summary: { flex: 1 },
  body: { marginTop: sp[2], paddingLeft: 20 + sp[2], gap: sp[1] },
})
