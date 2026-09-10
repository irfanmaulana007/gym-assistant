import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { initialsFor } from '@/lib/initials'

// Top-right account control: an initials avatar that navigates to the full
// Profile screen. Native mobile apps push a screen for account/settings rather
// than dropping a desktop-style popover menu — see .claude/rules/native-mobile-ux.md.
export function ProfileButton() {
  const { user } = useAuth()
  const navigate = useNavigate()

  if (!user) return null

  const name = user.display_name || user.email

  return (
    <button
      type="button"
      className="avatar"
      aria-label="Profile"
      onClick={() => navigate('/profile')}
    >
      {initialsFor(name)}
    </button>
  )
}
