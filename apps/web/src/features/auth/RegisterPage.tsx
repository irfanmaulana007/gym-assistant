import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/api/client'
import { Button, Field, ErrorText } from '@/components/ui'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    setSubmitting(true)
    try {
      await register(email, password, displayName)
      navigate('/', { replace: true })
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
    <div className="app-shell">
      <main className="app-main">
        <div className="auth-hero">
          <div className="auth-mark">🏋️</div>
          <h1>Create account</h1>
          <p>Start tracking your progressive overload.</p>
        </div>
        <form className="card stack" onSubmit={onSubmit}>
          <Field
            label="Display name"
            name="display_name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            error={fieldErrors.display_name}
            required
          />
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
            required
          />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
            required
          />
          <ErrorText>{error && Object.keys(fieldErrors).length === 0 ? error : ''}</ErrorText>
          <Button type="submit" variant="primary" block disabled={submitting}>
            {submitting ? 'Creating…' : 'Create account'}
          </Button>
        </form>
        <p className="center small muted">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </main>
    </div>
  )
}
