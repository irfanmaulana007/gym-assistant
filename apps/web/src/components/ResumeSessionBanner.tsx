import { Link, useLocation } from 'react-router-dom'
import { useActiveSession } from '@/hooks/useActiveSession'
import { useElapsed } from '@/hooks/useElapsed'
import { formatDuration } from '@/lib/format'
import { ChevronRight } from './icons'

// Persistent "resume workout" pill shown on the top-level tab screens whenever a
// session is still running (active or paused). Tapping it jumps to that session
// so the user can save or discard it. The API allows only one live session at a
// time, so a forgotten session otherwise blocks starting a new one (409) with no
// obvious way back — this surfaces it. Hidden while already viewing that session.
export function ResumeSessionBanner() {
  const { data: session } = useActiveSession()
  const location = useLocation()

  const paused = session?.status === 'paused'
  // Only tick while genuinely active; a paused session shows a static label.
  const elapsed = useElapsed(session?.started_at ?? null, session?.status === 'active')

  if (!session) return null
  if (location.pathname === `/sessions/${session.id}`) return null

  return (
    <Link to={`/sessions/${session.id}`} className="resume-bar" aria-label="Resume your active workout">
      <span className={`pulse-dot ${paused ? 'paused' : ''}`} />
      <div className="grow">
        <div className="resume-bar-title">{paused ? 'Workout paused' : 'Workout in progress'}</div>
        <div className="small muted">Tap to save or discard</div>
      </div>
      <span className="resume-bar-time">{paused ? 'Paused' : formatDuration(elapsed)}</span>
      <ChevronRight className="chevron" />
    </Link>
  )
}
