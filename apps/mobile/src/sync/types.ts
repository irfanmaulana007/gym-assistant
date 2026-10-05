import type { Exercise, Routine, SessionExercise, SetEntry, WorkoutSession } from '@/types/api'
import type { LocalStore, OutboxRecord } from '@/db/store'

// A failed push. `retryable` drives the worker: retryable errors (offline, 5xx,
// 429, timeouts) keep the record queued with backoff and stop the drain to
// preserve order; non-retryable errors (hard 4xx validation/conflict) drop the
// record to the conflict log and let the queue continue.
export class SyncError extends Error {
  retryable: boolean
  status?: number
  constructor(message: string, opts: { retryable: boolean; status?: number }) {
    super(message)
    this.name = 'SyncError'
    this.retryable = opts.retryable
    this.status = opts.status
  }
}

/** A full per-entity snapshot of server state (PRD 0018 §4.5 "Read / pull sync"
 * — v1 does a full refetch and upserts by id; children are flattened out of
 * their nested list responses). */
export interface ServerSnapshot {
  routines: Routine[]
  exercises: Exercise[]
  sessions: WorkoutSession[]
  sessionExercises: SessionExercise[]
  entries: SetEntry[]
}

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncStatus {
  phase: SyncPhase
  pending: number
  lastSyncedAt: string | null
  lastError: string | null
}

export interface SyncDeps {
  store: LocalStore
  /** Perform a single outbox mutation; throw SyncError on failure. */
  push: (rec: OutboxRecord) => Promise<void>
  /** Fetch the full server snapshot to reconcile into the local store. */
  pull: () => Promise<ServerSnapshot>
  /** Injectable clock (epoch ms) — tests advance it deterministically. */
  now?: () => number
  isOnline?: () => boolean
  onStatus?: (status: SyncStatus) => void
  /** Backoff (ms) for a record that has failed `attempts` times. */
  backoff?: (attempts: number) => number
}
