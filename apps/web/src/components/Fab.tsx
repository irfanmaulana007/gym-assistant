import type { ReactNode } from 'react'

// Floating action button: the primary "add" action, floating bottom-right and
// thumb-reachable, replacing the old header `+`. Positioned within the centered
// app shell. `offset` lifts it clear of a bottom tab bar (`nav`) or a sticky
// bottom CTA (`cta`). See PRD 0005.
export function Fab({
  label,
  onClick,
  offset,
  children,
}: {
  label: string
  onClick: () => void
  offset?: 'nav' | 'cta'
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`fab${offset ? ` fab--${offset}` : ''}`}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
