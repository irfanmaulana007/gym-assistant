import { useEffect, useState } from 'react'

// Seconds elapsed since `startedAt`, ticking once a second while `running`.
// Mirrors apps/web/src/hooks/useElapsed.ts.
export function useElapsed(startedAt: string | null, running: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running])
  if (!startedAt) return 0
  const started = Date.parse(startedAt)
  if (Number.isNaN(started)) return 0
  return Math.max(0, Math.floor((nowMs - started) / 1000))
}
