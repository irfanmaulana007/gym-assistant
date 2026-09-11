import type { ReactNode } from 'react'
import { NavBar, type BackTarget } from './NavBar'
import { BottomNav } from './BottomNav'

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
      {bottomNav ? <BottomNav /> : null}
    </div>
  )
}
