import { useAuth } from '@/lib/auth'
import { Layout } from '@/components/Layout'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui'
import { LogOutIcon } from '@/components/icons'
import { formatDate } from '@/lib/format'

// Full-screen account view (native pattern): the avatar in the nav bar pushes
// here instead of opening a dropdown. Identity up top, account details in a
// grouped inset list, and logout as the destructive action at the bottom.
export function ProfilePage() {
  const { user, logout } = useAuth()

  // Guarded by ProtectedRoute; the null-check keeps types honest and covers the
  // brief window after logout before the redirect fires.
  if (!user) return null

  const name = user.display_name || user.email

  return (
    <Layout title="Profile" back="/" backLabel="Workouts" showProfile={false}>
      <div className="profile-head">
        <Avatar name={name} size="lg" />
        <div className="profile-name">{user.display_name || 'Athlete'}</div>
        <div className="profile-email muted">{user.email}</div>
      </div>

      <div className="section-label">Account</div>
      <ul className="list-grouped">
        <li className="profile-row">
          <span className="muted">Email</span>
          <span className="profile-row-value">{user.email}</span>
        </li>
        <li className="profile-row">
          <span className="muted">Member since</span>
          <span className="profile-row-value">{formatDate(user.created_at)}</span>
        </li>
      </ul>

      <Button variant="danger" block onClick={() => logout()}>
        <LogOutIcon />
        Logout
      </Button>
    </Layout>
  )
}
