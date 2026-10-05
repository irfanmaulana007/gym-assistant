// Production push: translate one outbox record into the matching /api/v1 call
// (PRD 0018 §4.5 write path). The outbox payload shapes are produced by the
// repositories (src/db/repositories.ts); this is the inverse mapping.
//
// Error → SyncError classification drives the worker's retry/backoff vs.
// conflict-log behaviour:
//   - no status (network/timeout) / 5xx / 429 / 401 → retryable (keep queued)
//   - create returning 409 / delete returning 404 → treat as success: the
//     client-supplied id makes replays idempotent (§4.5), so "already exists"
//     and "already gone" are the desired end state.
//   - any other 4xx → non-retryable (conflict/validation; dropped to the log)

import { ApiError } from '@/api/client'
import { authApi } from '@/api/auth'
import { exercisesApi, routinesApi } from '@/api/routines'
import { sessionsApi, type AdHocExerciseInput, type EntryInput, type SessionExerciseSnapshot } from '@/api/sessions'
import type { OutboxRecord } from '@/db/store'
import type { ExerciseInput } from '@/api/routines'
import type { SessionExerciseStatus, UpdateProfileRequest } from '@/types/api'
import { SyncError } from './types'

function classify(err: unknown, op: OutboxRecord['op']): SyncError {
  if (err instanceof ApiError) {
    const s = err.status
    if (s >= 500 || s === 429 || s === 401) return new SyncError(err.message, { retryable: true, status: s })
    return new SyncError(err.message, { retryable: false, status: s })
  }
  // No HTTP status → almost certainly a network/timeout failure: retry.
  void op
  return new SyncError(err instanceof Error ? err.message : String(err), { retryable: true })
}

/** True when an error for this op can be treated as an idempotent success. */
function isIdempotentSuccess(err: unknown, op: OutboxRecord['op']): boolean {
  if (!(err instanceof ApiError)) return false
  if (op === 'create' && err.status === 409) return true
  if (op === 'delete' && err.status === 404) return true
  return false
}

async function dispatch(rec: OutboxRecord): Promise<void> {
  const { entity, op, entity_id, payload } = rec
  switch (entity) {
    case 'routine':
      if (op === 'create') {
        await routinesApi.create(payload.name as string, (payload.notes as string) ?? '', entity_id)
      } else if (op === 'update') {
        await routinesApi.update(entity_id, payload)
      } else {
        await routinesApi.remove(entity_id)
      }
      return
    case 'exercise':
      if (op === 'create') {
        const { routine_id, ...input } = payload as { routine_id: string } & ExerciseInput
        await exercisesApi.create(routine_id, { ...input, id: entity_id })
      } else if (op === 'update') {
        await exercisesApi.update(entity_id, payload as Partial<ExerciseInput>)
      } else {
        await exercisesApi.remove(entity_id)
      }
      return
    case 'session':
      // Only create (start) flows through here; lifecycle is its own entity.
      if (op === 'create') {
        await sessionsApi.start(
          payload.routine_id as string,
          entity_id,
          payload.exercises as SessionExerciseSnapshot[] | undefined,
        )
      } else if (op === 'delete') {
        await sessionsApi.abandon(entity_id)
      }
      return
    case 'session_lifecycle': {
      const action = payload.action as 'pause' | 'resume' | 'complete' | 'abandon'
      await sessionsApi[action](entity_id)
      return
    }
    case 'session_exercise':
      if (op === 'create') {
        const { session_id, ...input } = payload as { session_id: string } & AdHocExerciseInput
        await sessionsApi.addExercise(session_id, { ...input, id: entity_id })
      } else if (op === 'update') {
        await sessionsApi.updateSessionExercise(entity_id, payload as { status?: SessionExerciseStatus; position?: number })
      } else {
        await sessionsApi.removeSessionExercise(entity_id)
      }
      return
    case 'entry':
      if (op === 'create') {
        const { session_exercise_id, ...input } = payload as { session_exercise_id: string } & EntryInput
        await sessionsApi.addEntry(session_exercise_id, { ...input, id: entity_id })
      } else if (op === 'update') {
        await sessionsApi.updateEntry(entity_id, payload as EntryInput)
      } else {
        await sessionsApi.removeEntry(entity_id)
      }
      return
    case 'profile':
      await authApi.updateProfile(payload as UpdateProfileRequest)
      return
  }
}

/** Push a single outbox record; resolves on success, throws SyncError on failure. */
export async function pushRecord(rec: OutboxRecord): Promise<void> {
  try {
    await dispatch(rec)
  } catch (err) {
    if (isIdempotentSuccess(err, rec.op)) return
    throw classify(err, rec.op)
  }
}
