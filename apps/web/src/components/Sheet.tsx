import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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

  // Drive the mount/unmount lifecycle: mount immediately on open; on close drop
  // the `is-open` class and unmount once the exit animation has run.
  useEffect(() => {
    if (open) {
      setMounted(true)
      return undefined
    }
    if (mounted) {
      setVisible(false)
      const timer = setTimeout(() => setMounted(false), EXIT_MS)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [open, mounted])

  // Flip on the `is-open` class to run the enter transition. The panel mounts
  // off-screen (translateY(100%)); before adding `is-open` we force a synchronous
  // reflow by reading the panel's layout, so the browser commits that starting
  // transform. Without this the freshly-inserted node's initial style is never
  // painted, so it snaps straight to the open position — the sheet pops in with
  // no slide-up (only the close slide-down, whose start value is already
  // committed, animated). A layout effect runs after mount and before paint, so
  // the enter animates without waiting an extra frame (an added frame delays the
  // sheet's autofocus and races user interactions).
  useLayoutEffect(() => {
    if (open && mounted && !visible && panelRef.current) {
      void panelRef.current.offsetHeight // force reflow: commit the off-screen start
      setVisible(true)
    }
  }, [open, mounted, visible])

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
