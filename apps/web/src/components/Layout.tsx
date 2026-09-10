import type { ReactNode } from 'react'
import { NavBar, type BackTarget } from './NavBar'

// App shell: native top nav bar + single-column main area. `intro` renders an
// optional large-title/greeting block above the page content.
export function Layout({
  title,
  children,
  action,
  back,
  backLabel,
  intro,
  showProfile,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
  back?: BackTarget
  backLabel?: string
  intro?: ReactNode
  showProfile?: boolean
}) {
  return (
    <div className="app-shell">
      <NavBar title={title} back={back} backLabel={backLabel} action={action} showProfile={showProfile} />
      <main className="app-main">
        {intro}
        {children}
      </main>
    </div>
  )
}
