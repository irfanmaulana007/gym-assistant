import type { ReactNode } from 'react'
import { useAuth } from '@/lib/auth'
import { Button } from './ui'

// App shell: sticky header with title + logout, single-column main area.
export function Layout({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  const { user, logout } = useAuth()
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>{title}</h1>
        <div className="row">
          {action}
          {user ? (
            <Button size="sm" variant="ghost" onClick={logout} aria-label="Log out">
              Logout
            </Button>
          ) : null}
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  )
}
