import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from './icons'
import { ProfileButton } from './ProfileButton'

export type BackTarget = string | number | boolean

// Native-style top nav bar: back chevron on the left, centered title, and the
// account avatar (plus any page action) on the right.
export function NavBar({
  title,
  back,
  backLabel = 'Back',
  action,
  showProfile = true,
}: {
  title: string
  back?: BackTarget
  backLabel?: string
  action?: ReactNode
  showProfile?: boolean
}) {
  const navigate = useNavigate()

  const goBack = () => {
    if (typeof back === 'string') navigate(back)
    else if (typeof back === 'number') navigate(back)
    else navigate(-1)
  }

  return (
    <header className="navbar">
      <div className="navbar-left">
        {back != null && back !== false ? (
          <button type="button" className="nav-back" onClick={goBack} aria-label={backLabel}>
            <ChevronLeft />
            <span>{backLabel}</span>
          </button>
        ) : null}
      </div>
      <div className="navbar-center">
        <h1 className="navbar-title">{title}</h1>
      </div>
      <div className="navbar-right">
        {action}
        {showProfile ? <ProfileButton /> : null}
      </div>
    </header>
  )
}
