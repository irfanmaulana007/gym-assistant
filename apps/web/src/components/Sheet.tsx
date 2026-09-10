import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Exit animation length — keep in sync with the .sheet transition in styles.css
// so the node stays mounted until it has finished sliding/fading out.
const EXIT_MS = 240

// A form container that presents as a centered modal on desktop and a slide-up
// bottom sheet on mobile (see the media query in styles.css). Mounts through a
// portal, animates in on open, and stays mounted through its exit animation
// before unmounting. Closes on scrim tap, the close button, or Escape.
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
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Drive the enter/exit transitions: mount immediately on open then flip the
  // `is-open` class on the next frame; on close, drop the class and unmount
  // once the exit animation has run.
  useEffect(() => {
    if (open) {
      setMounted(true)
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    if (mounted) {
      setVisible(false)
      const timer = setTimeout(() => setMounted(false), EXIT_MS)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [open, mounted])

  // While mounted: close on Escape and lock background scroll.
  useEffect(() => {
    if (!mounted) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [mounted, onClose])

  // Move focus into the sheet when it opens for keyboard/screen-reader users.
  useEffect(() => {
    if (!visible) return
    const first = panelRef.current?.querySelector<HTMLElement>(
      'input, select, textarea, button:not(.sheet-close)',
    )
    first?.focus()
  }, [visible])

  const onScrim = useCallback(() => onClose(), [onClose])

  if (!mounted) return null

  return createPortal(
    <div className={`sheet-root${visible ? ' is-open' : ''}`} role="presentation">
      <button type="button" className="sheet-scrim" aria-label="Close" tabIndex={-1} onClick={onScrim} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={panelRef}>
        <div className="sheet-header">
          <span className="sheet-grabber" aria-hidden />
          <h2 className="sheet-title">{title}</h2>
          <button type="button" className="sheet-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
