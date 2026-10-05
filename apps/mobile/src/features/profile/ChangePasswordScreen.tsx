import React, { useState } from 'react'
import { Screen } from '@/components/Screen'
import { Button, Field, ErrorText } from '@/components/ui'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/client'
import type { RootScreenProps } from '@/navigation/types'

// Change password (PRD 0008 §4.5). Online-only: it calls the API directly
// (never the outbox) — a wrong current password surfaces the API's error
// inline; success pops back to the profile. Mirrors apps/web ChangePasswordPage.
export function ChangePasswordScreen({ navigation }: RootScreenProps<'ChangePassword'>) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const onSubmit = async () => {
    setError('')
    setFieldErrors({})
    if (next !== confirm) {
      setFieldErrors({ confirm: 'passwords do not match' })
      return
    }
    setSaving(true)
    try {
      await authApi.changePassword(current, next)
      navigation.goBack()
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message)
        if (e.details) {
          const fe: Record<string, string> = {}
          for (const [k, v] of Object.entries(e.details)) fe[k] = String(v)
          setFieldErrors(fe)
        }
      } else {
        setError('Could not change your password')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen
      bottomCta={
        <Button title={saving ? 'Saving…' : 'Update password'} variant="primary" block disabled={saving} onPress={onSubmit} />
      }
    >
      <Field
        label="Current password"
        secureTextEntry
        autoCapitalize="none"
        textContentType="password"
        value={current}
        onChangeText={setCurrent}
      />
      <Field
        label="New password"
        secureTextEntry
        autoCapitalize="none"
        textContentType="newPassword"
        value={next}
        onChangeText={setNext}
        error={fieldErrors.new_password}
      />
      <Field
        label="Confirm new password"
        secureTextEntry
        autoCapitalize="none"
        textContentType="newPassword"
        value={confirm}
        onChangeText={setConfirm}
        error={fieldErrors.confirm}
      />
      <ErrorText>{error && Object.keys(fieldErrors).length === 0 ? error : ''}</ErrorText>
    </Screen>
  )
}
