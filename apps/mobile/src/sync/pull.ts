// Production pull: fetch a full per-entity server snapshot to reconcile into the
// local store (PRD 0018 §4.5 "Read / pull sync" — v1 full refetch, upsert by
// id). Per-user data is small, so we fetch each routine/session detail to get
// its nested children and flatten them into per-table arrays.
//
// Known v1 simplification (documented in CLAUDE.md): sessions are pulled as a
// bounded page, so the tombstone pass must not delete local sessions older than
// the window. The worker only tombstones against the fetched set; a `?since=`
// delta endpoint + server tombstones is the later optimisation the PRD defers.

import { routinesApi } from '@/api/routines'
import { sessionsApi } from '@/api/sessions'
import type { Exercise, SessionExercise, SetEntry } from '@/types/api'
import type { ServerSnapshot } from './types'

const SESSION_PAGE = 100

export async function pullSnapshot(): Promise<ServerSnapshot> {
  const snap: ServerSnapshot = {
    routines: [],
    exercises: [],
    sessions: [],
    sessionExercises: [],
    entries: [],
  }

  const routineList = await routinesApi.list()
  for (const r of routineList) {
    const full = await routinesApi.get(r.id)
    const { exercises, ...routine } = full
    snap.routines.push(routine)
    for (const ex of exercises ?? []) snap.exercises.push(ex as Exercise)
  }

  const sessionList = await sessionsApi.list(SESSION_PAGE, 0)
  for (const s of sessionList) {
    const full = await sessionsApi.get(s.id)
    const { exercises, events, ...session } = full
    void events
    snap.sessions.push(session as (typeof snap.sessions)[number])
    for (const se of exercises ?? []) {
      const { entries, ...sessionExercise } = se
      snap.sessionExercises.push(sessionExercise as SessionExercise)
      for (const entry of entries ?? []) snap.entries.push(entry as SetEntry)
    }
  }

  return snap
}
