import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/Screen'
import { Button, Field, ErrorText } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/api/client'
import { color, g, radius, sp } from '@/theme'
import type { AuthScreenProps } from '@/navigation/types'

// Ported from apps/web/src/features/auth/LoginPage.tsx. Full-screen (no tab
// bar); on success the RootNavigator swaps to the app automatically.
export function LoginScreen({ navigation }: AuthScreenProps<'Login'>) {
  const { login } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit() {
    setError('')
    setSubmitting(true)
    try {
      await login(identifier, password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen>
      <View style={s.hero}>
        <View style={s.mark}>
          <Text style={s.markEmoji}>🏋️</Text>
        </View>
        <Text style={s.title}>Gym Assistant</Text>
        <Text style={s.subtitle}>Log in to track your lifts.</Text>
      </View>

      <View style={[g.card, g.stack]}>
        <Field
          label="Username or email"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          value={identifier}
          onChangeText={setIdentifier}
        />
        <Field
          label="Password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          value={password}
          onChangeText={setPassword}
        />
        <ErrorText>{error}</ErrorText>
        <Button
          title={submitting ? 'Logging in…' : 'Log in'}
          variant="primary"
          block
          loading={submitting}
          onPress={onSubmit}
        />
      </View>

      <View style={s.crosslink}>
        <Text style={[g.small, g.muted]}>No account? </Text>
        <Pressable onPress={() => navigation.navigate('Register')} accessibilityRole="link">
          <Text style={[g.small, s.link]}>Create one</Text>
        </Pressable>
      </View>
    </Screen>
  )
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: sp[8], paddingBottom: sp[4], gap: sp[2] },
  mark: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: sp[2],
  },
  markEmoji: { fontSize: 34 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, color: color.text },
  subtitle: { color: color.textMuted },
  crosslink: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  link: { color: color.primary, fontWeight: '600' },
})
