import React, { type ReactNode } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { color, layout, radius, sp } from '@/theme'
import { tapFeedback } from '@/lib/haptics'

// Floating action button: the primary "add" action, thumb-reachable bottom-right
// (mirrors web Fab.tsx). `offset="cta"` lifts it clear of a sticky bottom CTA.
export function Fab({
  label,
  onPress,
  offset,
  children,
}: {
  label: string
  onPress: () => void
  /** `tab` lifts clear of the bottom tab bar; `cta` lifts clear of a sticky CTA. */
  offset?: 'tab' | 'cta'
  children: ReactNode
}) {
  const insets = useSafeAreaInsets()
  const base = offset === 'cta' ? 88 : offset === 'tab' ? layout.bottomNavH + sp[4] : sp[5]
  const bottom = base + insets.bottom
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        tapFeedback('impactMedium')
        onPress()
      }}
      style={({ pressed }) => [s.fab, { bottom }, pressed && s.pressed]}
    >
      {children}
    </Pressable>
  )
}

const s = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: sp[4],
    width: 56,
    height: 56,
    maxWidth: layout.maxWidth,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.primary,
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  pressed: { transform: [{ scale: 0.92 }], backgroundColor: color.primaryPress },
})
