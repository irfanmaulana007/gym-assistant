import { useAuth } from '@/lib/auth'
import { Layout } from '@/components/Layout'

// Placeholder home for the auth foundation PR. Replaced by the routines list in
// the feature-screens PR.
export function HomePage() {
  const { user } = useAuth()
  return (
    <Layout title="Gym Assistant">
      <div className="card stack">
        <h2 style={{ margin: 0 }}>Welcome, {user?.display_name} 👋</h2>
        <p className="muted">
          You're signed in. Your workout days, exercises, and live sessions land here next.
        </p>
      </div>
    </Layout>
  )
}
