import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/client'
import { Layout } from '@/components/Layout'
import { Button, Field, ErrorText } from '@/components/ui'

// Pushed full screen (native pattern): change the password with the current one
// plus a new one confirmed twice (PRD 0008 §4.5). A wrong current password
// surfaces the API's 401 inline; success pops back to the profile.
export function ChangePasswordPage() {
  const navigate = useNavigate()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const mut = useMutation({
    mutationFn: () => authApi.changePassword(current, next),
    onSuccess: () => navigate('/profile'),
    onError: (e) => {
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
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    if (next !== confirm) {
      setFieldErrors({ confirm: 'passwords do not match' })
      return
    }
    mut.mutate()
  }

  return (
    <Layout title="Change password" back="/profile" backLabel="Profile">
      <form className="stack" onSubmit={onSubmit}>
        <Field
          label="Current password"
          name="current_password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
        <Field
          label="New password"
          name="new_password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          error={fieldErrors.new_password}
          required
        />
        <Field
          label="Confirm new password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={fieldErrors.confirm}
          required
        />
        <ErrorText>{error && Object.keys(fieldErrors).length === 0 ? error : ''}</ErrorText>
        <div className="sticky-cta">
          <Button type="submit" variant="primary" block disabled={mut.isPending}>
            {mut.isPending ? 'Saving…' : 'Update password'}
          </Button>
        </div>
      </form>
    </Layout>
  )
}
