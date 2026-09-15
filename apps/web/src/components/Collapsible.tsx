import { useState, type ReactNode } from 'react'
import { ChevronRight } from './icons'

// A native-style disclosure row: a full-width tappable header with a rotating
// chevron that expands to reveal `children`. Used to fold per-set detail under
// an exercise/session summary without pushing a new screen.
export function Collapsible({
  summary,
  children,
  defaultOpen = false,
  ariaLabel,
}: {
  summary: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="collapsible">
      <button
        type="button"
        className="collapsible-header"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronRight className="chevron collapsible-chevron" data-open={open} />
        <span className="collapsible-summary">{summary}</span>
      </button>
      {open ? <div className="collapsible-body">{children}</div> : null}
    </div>
  )
}
