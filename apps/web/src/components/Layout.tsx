import type { ReactNode } from 'react'
import { NavBar, type BackTarget } from './NavBar'
import { BottomNav } from './BottomNav'

// App shell: native top nav bar + single-column main area, with an optional
// bottom tab bar for the top-level screens. `intro` renders an optional
// large-title/greeting block above the page content.
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
  return (
    <div className={`app-shell${bottomNav ? ' has-bottom-nav' : ''}`}>
      <NavBar title={title} back={back} backLabel={backLabel} />
      <main className="app-main">
        {intro}
        {children}
      </main>
      {bottomNav ? <BottomNav /> : null}
    </div>
  )
}
