import { useEffect, useState } from 'react'

// Ticks once a second while `running`, returning seconds elapsed since `since`.
// Used for the active-session running timer (display only; the server event log
// is the record of truth for persisted durations).
export function useElapsed(since: string | null, running: boolean): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running])

  if (!since) return 0
  const start = new Date(since).getTime()
  if (Number.isNaN(start)) return 0
  return Math.max(0, Math.floor((now - start) / 1000))
}
