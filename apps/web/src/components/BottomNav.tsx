import { NavLink } from 'react-router-dom'
import { ChartIcon, DumbbellIcon, UserIcon } from './icons'

// Native-style bottom tab bar (Instagram-style): the app's top-level
// destinations live here rather than as buttons in the header, keeping the top
// nav bar clean (back chevron + title only). Progress is the landing tab at `/`
// (PRD 0007); the workout-days list moved to `/workout`. See PRD 0005 and
// .claude/rules/native-mobile-ux.md.
const TABS = [
  { to: '/', label: 'Progress', Icon: ChartIcon },
  { to: '/workout', label: 'Workout', Icon: DumbbellIcon },
  { to: '/profile', label: 'Profile', Icon: UserIcon },
] as const

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) => `bottom-nav-item${isActive ? ' is-active' : ''}`}
        >
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
