import React from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native'
import { color, radius, sp } from '@/theme'
import { tapFeedback } from '@/lib/haptics'

type Variant = 'primary' | 'ghost' | 'danger' | 'default'

export function Button({
  title,
  onPress,
  variant = 'default',
  block,
  size = 'md',
  disabled,
  loading,
  icon,
}: {
  title: string
  onPress: () => void
  variant?: Variant
  block?: boolean
  size?: 'sm' | 'md'
  disabled?: boolean
  loading?: boolean
  icon?: React.ReactNode
}) {
  const isDisabled = disabled || loading
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={() => {
        tapFeedback('impactLight')
        onPress()
      }}
      style={({ pressed }) => [
        s.btn,
        size === 'sm' && s.btnSm,
        variant === 'primary' && s.btnPrimary,
        variant === 'ghost' && s.btnGhost,
        variant === 'danger' && s.btnDanger,
        block && s.btnBlock,
        pressed && !isDisabled && s.btnPressed,
        isDisabled && s.btnDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? color.primaryInk : color.text} />
      ) : (
        <>
          {icon}
          <Text
            style={[
              s.btnText,
              size === 'sm' && s.btnTextSm,
              variant === 'primary' && s.btnTextPrimary,
              variant === 'danger' && s.btnTextDanger,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  )
}

export function Field({
  label,
  error,
  ...rest
}: { label: string; error?: string } & TextInputProps) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        placeholderTextColor={color.textFaint}
        style={s.input}
        {...rest}
      />
      {error ? <Text style={s.errorText}>{error}</Text> : null}
    </View>
  )
}

export function ErrorText({ children }: { children?: React.ReactNode }) {
  if (!children) return null
  return <Text style={s.errorText}>{children}</Text>
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={s.spinner}>
      <ActivityIndicator color={color.textMuted} />
      <Text style={s.spinnerLabel}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  btn: {
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radius.base,
    paddingHorizontal: sp[4],
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sp[2],
    backgroundColor: color.surface2,
  },
  btnSm: { minHeight: 38, paddingHorizontal: sp[3], borderRadius: radius.sm },
  btnPrimary: { backgroundColor: color.primary },
  btnGhost: { backgroundColor: 'transparent', borderColor: color.borderStrong },
  btnDanger: { backgroundColor: 'transparent', borderColor: 'rgba(255,91,96,0.45)' },
  btnBlock: { alignSelf: 'stretch', width: '100%' },
  btnPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  btnDisabled: { opacity: 0.45 },
  btnText: { fontSize: 16, fontWeight: '600', color: color.text },
  btnTextSm: { fontSize: 14 },
  btnTextPrimary: { color: color.primaryInk },
  btnTextDanger: { color: color.danger },
  field: { gap: sp[2] },
  label: { fontSize: 13, fontWeight: '500', color: color.textMuted, paddingLeft: 2 },
  input: {
    backgroundColor: color.bgElevated,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.base,
    color: color.text,
    paddingHorizontal: sp[4],
    minHeight: 50,
    fontSize: 16,
  },
  errorText: { color: color.danger, fontSize: 14 },
  spinner: { padding: sp[6], alignItems: 'center', gap: sp[2] },
  spinnerLabel: { color: color.textMuted },
})
