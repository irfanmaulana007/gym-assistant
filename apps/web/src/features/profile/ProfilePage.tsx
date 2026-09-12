import { Link } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { Layout } from '@/components/Layout'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui'
import { ChevronRight, LogOutIcon } from '@/components/icons'
import { formatDate } from '@/lib/format'
import { formatWeight, formatHeight } from '@/lib/units'
import { ageFrom } from '@/lib/age'
import {
  ACTIVITY_LEVEL_LABELS,
  FITNESS_GOAL_LABELS,
  GENDER_LABELS,
  type User,
} from '@/types/api'

// One "label / value" row inside a grouped inset list.
function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="profile-row">
      <span className="muted">{label}</span>
      <span className="profile-row-value">{value}</span>
    </li>
  )
}

// Collect the health rows that are actually populated so the section only shows
// data the user has entered.
function healthRows(user: User): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  if (user.gender) rows.push({ label: 'Gender', value: GENDER_LABELS[user.gender] })
  const age = ageFrom(user.date_of_birth)
  if (age != null) rows.push({ label: 'Age', value: `${age}` })
  if (user.body_weight != null && user.body_weight_unit) {
    rows.push({ label: 'Weight', value: formatWeight(user.body_weight, user.body_weight_unit, user.preferred_weight_unit) })
  }
  if (user.height != null && user.height_unit) {
    rows.push({ label: 'Height', value: formatHeight(user.height, user.height_unit, user.preferred_height_unit) })
  }
  if (user.fitness_goal) rows.push({ label: 'Goal', value: FITNESS_GOAL_LABELS[user.fitness_goal] })
  if (user.activity_level) rows.push({ label: 'Activity', value: ACTIVITY_LEVEL_LABELS[user.activity_level] })
  return rows
}

// Full-screen account view (native pattern): reached from the Profile tab in
// the bottom navigation bar (PRD 0005), not a header control. Identity up top,
// then health data and account details in grouped inset lists, and Edit /
// Change password / Logout actions (PRD 0008).
export function ProfilePage() {
  const { user, logout } = useAuth()

  // Guarded by ProtectedRoute; the null-check keeps types honest and covers the
  // brief window after logout before the redirect fires.
  if (!user) return null

  const name = user.display_name || user.email
  const health = healthRows(user)

  return (
    <Layout title="Profile" bottomNav>
      <div className="profile-head">
        <Avatar name={name} src={user.avatar_url} size="lg" />
        <div className="profile-name">{user.display_name || 'Athlete'}</div>
        {user.username ? <div className="profile-email muted">@{user.username}</div> : null}
        <div className="profile-email muted">{user.email}</div>
      </div>

      {health.length > 0 ? (
        <>
          <div className="section-label">Health</div>
          <ul className="list-grouped">
            {health.map((r) => (
              <Row key={r.label} label={r.label} value={r.value} />
            ))}
          </ul>
        </>
      ) : null}

      <div className="section-label">Account</div>
      <ul className="list-grouped">
        {user.full_name ? <Row label="Full name" value={user.full_name} /> : null}
        <Row label="Email" value={user.email} />
        <Row label="Member since" value={formatDate(user.created_at)} />
      </ul>

      <div className="section-label">Settings</div>
      <ul className="list-grouped">
        <li>
          <Link to="/profile/edit" className="nav-row">
            <span className="grow">Edit profile</span>
            <ChevronRight className="chevron" />
          </Link>
        </li>
        <li>
          <Link to="/profile/password" className="nav-row">
            <span className="grow">Change password</span>
            <ChevronRight className="chevron" />
          </Link>
        </li>
      </ul>

      <Button variant="danger" block onClick={() => logout()}>
        <LogOutIcon />
        Logout
      </Button>
    </Layout>
  )
}
