import type { ReactNode } from 'react'
import { NavBar, type BackTarget } from './NavBar'
import { BottomNav } from './BottomNav'
import { ResumeSessionBanner } from './ResumeSessionBanner'

// App shell: native top nav bar + single-column main area, with an optional
// bottom tab bar for the top-level screens. `intro` renders an optional
// large-title/greeting block above the page content.
//
// The top nav bar only renders on child screens — those pushed with a back
// chevron. Top-level tab screens (Home/Profile) and full-screen flows carry
// their own large in-body heading, so a nav bar there would be empty chrome:
// a blank strip at the top. When there's no header we drop the element entirely
// (no empty <header> landmark) and flag the shell `no-header` so the CSS keeps
// the safe-area inset and sticky offsets correct without it.
export function Layout({
  title,
  children,
  back,
  backLabel,
  intro,
  bottomNav = false,
}: {
  title: string
  children: ReactNode
  back?: BackTarget
  backLabel?: string
  intro?: ReactNode
  bottomNav?: boolean
}) {
  const hasHeader = back != null && back !== false

  const shellClass = [
    'app-shell',
    bottomNav ? 'has-bottom-nav' : '',
    hasHeader ? '' : 'no-header',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={shellClass}>
      {hasHeader ? <NavBar title={title} back={back} backLabel={backLabel} /> : null}
      <main className="app-main">
        {intro}
        {children}
      </main>
      {/* Persistent resume-workout pill, on the top-level tab screens where the
          user navigates away from a running session (it floats above the tab
          bar). It hides itself when nothing is running or when already on the
          session page. */}
      {bottomNav ? <ResumeSessionBanner /> : null}
      {bottomNav ? <BottomNav /> : null}
    </div>
  )
}
