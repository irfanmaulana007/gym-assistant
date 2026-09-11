import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from './icons'

export type BackTarget = string | number | boolean

// Native-style top nav bar: back chevron on the left and a centered title —
// nothing on the right. Top-level navigation (Home/Profile) lives in the bottom
// tab bar, and per-screen actions live in the page body (FAB / inline). Keeping
// the header clean is a repo rule — see .claude/rules/native-mobile-ux.md and
// PRD 0005. The empty right column preserves the grid so the title stays
// optically centered.
export function NavBar({
  title,
  back,
  backLabel = 'Back',
}: {
  title: string
  back?: BackTarget
  backLabel?: string
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
      <div className="navbar-right" aria-hidden />
    </header>
  )
}
