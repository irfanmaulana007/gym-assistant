import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/Screen'
import { Button, Field, ErrorText } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/api/client'
import { color, g, radius, sp } from '@/theme'
import type { AuthScreenProps } from '@/navigation/types'

// Ported from apps/web/src/features/auth/RegisterPage.tsx. Inline field errors
// map the server's validation `details`; otherwise a general error shows.
export function RegisterScreen({ navigation }: AuthScreenProps<'Register'>) {
  const { register } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit() {
    setError('')
    setFieldErrors({})
    setSubmitting(true)
    try {
      await register(email, password, displayName, username.trim() || undefined)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
        if (err.details) {
          const fe: Record<string, string> = {}
          for (const [k, v] of Object.entries(err.details)) fe[k] = String(v)
          setFieldErrors(fe)
        }
      } else {
        setError('Something went wrong')
      }
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
        <Text style={s.title}>Create account</Text>
        <Text style={s.subtitle}>Start tracking your progressive overload.</Text>
      </View>

      <View style={[g.card, g.stack]}>
        <Field label="Display name" value={displayName} onChangeText={setDisplayName} error={fieldErrors.display_name} />
        <Field
          label="Username (optional)"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          placeholder="letters, numbers, _ and ."
          value={username}
          onChangeText={setUsername}
          error={fieldErrors.username}
        />
        <Field
          label="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          error={fieldErrors.email}
        />
        <Field
          label="Password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password-new"
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
          error={fieldErrors.password}
        />
        <ErrorText>{error && Object.keys(fieldErrors).length === 0 ? error : ''}</ErrorText>
        <Button
          title={submitting ? 'Creating…' : 'Create account'}
          variant="primary"
          block
          loading={submitting}
          onPress={onSubmit}
        />
      </View>

      <View style={s.crosslink}>
        <Text style={[g.small, g.muted]}>Already have an account? </Text>
        <Pressable onPress={() => navigation.navigate('Login')} accessibilityRole="link">
          <Text style={[g.small, s.link]}>Log in</Text>
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
