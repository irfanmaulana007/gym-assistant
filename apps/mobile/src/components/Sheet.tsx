import React, { type ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { color, radius, shadow, sp } from '@/theme'
import { XIcon } from './icons'

// Native bottom sheet (the RN equivalent of apps/web Sheet.tsx) — a slide-up
// panel over a scrim, for quick contextual forms (create/edit routine, exercise
// picker, edit exercise). Per the native-mobile-ux rule we use a sheet, never a
// desktop popover.
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.root}>
        <Pressable style={s.scrim} accessibilityLabel="Close" onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[s.sheet, { paddingBottom: sp[5] + insets.bottom }]}>
            <View style={s.grabber} />
            <View style={s.header}>
              <View style={s.headerSide} />
              <Text style={s.title}>{title}</Text>
              <Pressable style={[s.headerSide, s.closeWrap]} onPress={onClose} accessibilityLabel="Close">
                <View style={s.close}>
                  <XIcon size={15} color={color.textMuted} />
                </View>
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: sp[4],
    paddingTop: sp[3],
    maxHeight: '90%',
    ...shadow.menu,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.borderStrong,
    alignSelf: 'center',
    marginBottom: sp[2],
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: sp[3] },
  headerSide: { flex: 1 },
  closeWrap: { alignItems: 'flex-end' },
  title: { flex: 2, textAlign: 'center', fontSize: 17, fontWeight: '600', color: color.text },
  close: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { gap: sp[3], paddingBottom: sp[2] },
})
