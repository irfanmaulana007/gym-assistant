import React, { type ReactNode } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { color, layout, sp } from '@/theme'
import { useSync } from '@/lib/sync'

// App shell for a screen body: a safe-area background + a scrollable, centered
// single-column content area (capped at the 480px phone column so it still
// reads as a phone layout on iPad — PRD 0018 §4.3). Pull-to-refresh triggers a
// sync (§4.6). The top nav bar / bottom tab bar are provided by React
// Navigation (navigation/*), matching the web NavBar + BottomNav split.
export function Screen({
  children,
  scroll = true,
  refreshable = false,
  bottomCta,
  edges = ['top'],
}: {
  children: ReactNode
  scroll?: boolean
  refreshable?: boolean
  bottomCta?: ReactNode
  edges?: ('top' | 'bottom')[]
}) {
  const { syncNow, status } = useSync()
  const body = (
    <View style={s.column}>
      <View style={s.inner}>{children}</View>
    </View>
  )
  return (
    <SafeAreaView style={s.safe} edges={edges}>
      {scroll ? (
        <ScrollView
          style={s.flex}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            refreshable ? (
              <RefreshControl
                refreshing={status.phase === 'syncing'}
                onRefresh={() => void syncNow()}
                tintColor={color.textMuted}
              />
            ) : undefined
          }
        >
          {body}
        </ScrollView>
      ) : (
        <View style={s.flex}>{body}</View>
      )}
      {bottomCta ? <View style={s.cta}>{bottomCta}</View> : null}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  column: { flex: 1, alignItems: 'center' },
  inner: { width: '100%', maxWidth: layout.maxWidth, flex: 1, padding: sp[4], gap: sp[4] },
  cta: {
    paddingHorizontal: sp[4],
    paddingTop: sp[3],
    paddingBottom: sp[4],
    backgroundColor: color.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
})
