import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'ghost' | 'danger' | 'default'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  block?: boolean
  size?: 'sm' | 'md'
}

export function Button({ variant = 'default', block, size = 'md', className = '', ...rest }: ButtonProps) {
  const classes = [
    'btn',
    variant === 'primary' && 'btn-primary',
    variant === 'ghost' && 'btn-ghost',
    variant === 'danger' && 'btn-danger',
    block && 'btn-block',
    size === 'sm' && 'btn-sm',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return <button className={classes} {...rest} />
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

export function Field({ label, error, id, ...rest }: FieldProps) {
  const inputId = id ?? rest.name ?? label
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} className="input" {...rest} />
      {error ? <span className="error-text">{error}</span> : null}
    </div>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="error-text">{children}</p>
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="spinner">{label}</div>
}
