import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { Avatar } from './Avatar'
import { initialsFor } from '@/lib/initials'
import { LogOutIcon } from './icons'

// Top-right account control: an initials avatar that opens a native-style
// popover menu with the signed-in identity and a logout action.
export function ProfileMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!user) return null

  const name = user.display_name || user.email

  return (
    <>
      <button
        type="button"
        className="avatar"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {initialsFor(name)}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="menu-scrim"
            aria-label="Close account menu"
            onClick={() => setOpen(false)}
          />
          <div className="menu" role="menu">
            <div className="menu-head">
              <Avatar name={name} />
              <div className="menu-head-text">
                <div className="menu-name">{user.display_name || 'Athlete'}</div>
                <div className="menu-email">{user.email}</div>
              </div>
            </div>
            <button
              type="button"
              role="menuitem"
              className="menu-item menu-item-danger"
              onClick={() => {
                setOpen(false)
                logout()
              }}
            >
              <LogOutIcon />
              Logout
            </button>
          </div>
        </>
      ) : null}
    </>
  )
}
