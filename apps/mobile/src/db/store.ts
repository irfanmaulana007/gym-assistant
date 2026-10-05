// The local store — the app's SOURCE OF TRUTH (PRD 0018 §4.5). Every screen
// reads from and writes to this store; the sync layer (src/sync) is the only
// thing that touches the network, reconciling this store against the server.
//
// Two implementations satisfy `LocalStore`:
//   - memoryStore.ts  — process-memory, used by unit tests and as a fallback.
//   - sqliteStore.ts  — durable op-sqlite backing, used by the app.
// The sync engine and repositories depend only on this interface, so the exact
// same logic is exercised in tests (memory) and on-device (SQLite).

import type {
  Exercise,
  Routine,
  SessionExercise,
  SetEntry,
  User,
  WorkoutSession,
} from '@/types/api'

/** A persisted mutation awaiting push to the server (the outbox — §4.5). */
export type OutboxOp = 'create' | 'update' | 'delete'

export type OutboxEntity =
  | 'routine'
  | 'exercise'
  | 'session'
  | 'session_exercise'
  | 'entry'
  | 'profile'
  // Session lifecycle transitions (pause/resume/complete/abandon) — one row per
  // transition, replayed as the matching POST /sessions/:id/{action}.
  | 'session_lifecycle'

export type OutboxState = 'pending' | 'syncing' | 'failed'

export interface OutboxRecord {
  /** Outbox record id (distinct from the target entity id). */
  id: string
  /** Monotonic sequence — the queue drains in this order. */
  seq: number
  entity: OutboxEntity
  op: OutboxOp
  /** Client-generated id of the target entity (or parent, for entries). */
  entity_id: string
  /** The request payload (entity fields, or {action} for session_lifecycle). */
  payload: Record<string, unknown>
  /** updated_at of the local row when queued — the LWW base version. */
  base_version: string | null
  created_at: string
  state: OutboxState
  attempts: number
  /** Epoch ms before which this record should not be retried (backoff). */
  next_attempt_at: number
  last_error: string | null
}

export interface Table<T extends { id: string }> {
  all(): T[]
  get(id: string): T | undefined
  upsert(row: T): void
  delete(id: string): void
  clear(): void
}

export interface OutboxStore {
  /** All records in seq order. */
  all(): OutboxRecord[]
  /** Pending/failed records due for a push attempt (next_attempt_at <= now), in seq order. */
  due(now: number): OutboxRecord[]
  enqueue(rec: Omit<OutboxRecord, 'seq'>): OutboxRecord
  update(rec: OutboxRecord): void
  /** Remove a record once its mutation is confirmed synced. */
  remove(id: string): void
  /** Pending/failed records targeting a given entity id, in seq order. */
  forEntity(entityId: string): OutboxRecord[]
  clear(): void
}

export interface KeyValue {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T): void
  delete(key: string): void
}

export interface LocalStore {
  routines: Table<Routine>
  exercises: Table<Exercise>
  sessions: Table<WorkoutSession>
  sessionExercises: Table<SessionExercise>
  entries: Table<SetEntry>
  /** Cached current user + server-derived read-only caches (dashboard, etc.). */
  meta: KeyValue
  outbox: OutboxStore
  /** Run a batch of writes atomically. */
  transaction(fn: () => void): void
}

// Well-known meta keys.
export const META_USER = 'user'
export const META_LAST_SYNCED_AT = 'last_synced_at'
export const META_DASHBOARD = (window: string) => `dashboard:${window}`
export const META_MUSCLE_GROUPS = (window: string) => `muscle_groups:${window}`

export type CachedUser = User
