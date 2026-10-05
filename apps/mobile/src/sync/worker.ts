// The sync worker — drains the outbox to the server (push) and reconciles the
// server snapshot into the local store (pull), per PRD 0018 §4.5. It is the
// ONLY thing in the app that touches the network.
//
// The worker depends only on the injected `push`/`pull`/clock/online deps
// (sync/types.ts), so its ordering, backoff, idempotency, and LWW behaviour are
// exercised in unit tests against the in-memory store with a fake network, and
// run unchanged on-device wired to the real API + op-sqlite + NetInfo.

import type { LocalStore, OutboxRecord, Table } from '@/db/store'
import { resolveLWW } from './resolve'
import type { ServerSnapshot, SyncDeps, SyncStatus } from './types'
import { SyncError } from './types'

const DEFAULT_BACKOFF = (attempts: number) => Math.min(30_000, 1000 * 2 ** (attempts - 1))

export class SyncWorker {
  private store: LocalStore
  private push: SyncDeps['push']
  private pull: SyncDeps['pull']
  private now: () => number
  private isOnline: () => boolean
  private onStatus?: (s: SyncStatus) => void
  private backoff: (attempts: number) => number

  private running = false
  private lastError: string | null = null
  /** Records dropped to the conflict log (hard 4xx) — surfaced in the UI sync log. */
  readonly conflicts: { record: OutboxRecord; error: string }[] = []

  constructor(deps: SyncDeps) {
    this.store = deps.store
    this.push = deps.push
    this.pull = deps.pull
    this.now = deps.now ?? (() => Date.now())
    this.isOnline = deps.isOnline ?? (() => true)
    this.onStatus = deps.onStatus
    this.backoff = deps.backoff ?? DEFAULT_BACKOFF
  }

  private pendingCount(): number {
    return this.store.outbox.all().length
  }

  private emit(phase: SyncStatus['phase']): void {
    this.onStatus?.({
      phase,
      pending: this.pendingCount(),
      lastSyncedAt: this.store.meta.get<string>('last_synced_at') ?? null,
      lastError: this.lastError,
    })
  }

  /**
   * Drain pending outbox records in strict seq order. Stops at the first
   * retryable failure (preserving per-entity order); drops non-retryable
   * failures to the conflict log and continues. Returns the number of records
   * successfully pushed.
   */
  async drainOutbox(): Promise<number> {
    if (!this.isOnline()) {
      this.emit('offline')
      return 0
    }
    let pushed = 0
    // Re-read due records each pass; a record removed on success shortens the list.
    // We iterate by index over a seq-ordered snapshot and stop on retryable error.
    const due = this.store.outbox.due(this.now())
    for (const snapshot of due) {
      // The record may have been updated since the snapshot; re-fetch latest.
      const rec = this.store.outbox.all().find((r) => r.id === snapshot.id)
      if (!rec) continue
      rec.state = 'syncing'
      this.store.outbox.update(rec)
      try {
        await this.push(rec)
        this.store.outbox.remove(rec.id)
        pushed++
      } catch (err) {
        const e = err instanceof SyncError ? err : new SyncError(String(err), { retryable: true })
        rec.attempts += 1
        rec.last_error = e.message
        if (e.retryable) {
          rec.state = 'failed'
          rec.next_attempt_at = this.now() + this.backoff(rec.attempts)
          this.store.outbox.update(rec)
          this.lastError = e.message
          this.emit('error')
          // Preserve order: stop draining; the rest retry on the next tick.
          return pushed
        }
        // Hard 4xx — conflict/validation. Drop it and keep going.
        this.conflicts.push({ record: rec, error: e.message })
        this.store.outbox.remove(rec.id)
        this.lastError = e.message
      }
    }
    return pushed
  }

  /** Reconcile one entity table against the server rows for it (LWW + tombstones). */
  private reconcileTable<T extends { id: string; updated_at?: string }>(
    table: Table<T>,
    serverRows: T[],
  ): void {
    const serverById = new Map(serverRows.map((r) => [r.id, r]))
    for (const server of serverRows) {
      const local = table.get(server.id)
      const pending = this.store.outbox.forEntity(server.id).length > 0
      if (resolveLWW(local, server, pending) === 'server') {
        table.upsert(server)
      }
    }
    // Tombstone: a local row absent from the server pull with no pending local
    // create was deleted on the server — propagate the deletion.
    for (const local of table.all()) {
      if (serverById.has(local.id)) continue
      const hasPendingCreate = this.store.outbox
        .forEntity(local.id)
        .some((r) => r.op === 'create')
      if (!hasPendingCreate) table.delete(local.id)
    }
  }

  /** Pull server state and reconcile it into the local store. */
  async pullAndReconcile(): Promise<void> {
    if (!this.isOnline()) {
      this.emit('offline')
      return
    }
    const snap: ServerSnapshot = await this.pull()
    this.store.transaction(() => {
      this.reconcileTable(this.store.routines, snap.routines)
      this.reconcileTable(this.store.exercises, snap.exercises)
      this.reconcileTable(this.store.sessions, snap.sessions)
      this.reconcileTable(this.store.sessionExercises, snap.sessionExercises)
      this.reconcileTable(this.store.entries, snap.entries)
    })
  }

  /**
   * One full sync cycle: push local changes first (so our writes reach the
   * server before we pull), then pull + reconcile. Re-entrant-safe: a second
   * concurrent call is a no-op while one is running.
   */
  async sync(): Promise<void> {
    if (this.running) return
    if (!this.isOnline()) {
      this.emit('offline')
      return
    }
    this.running = true
    this.emit('syncing')
    try {
      await this.drainOutbox()
      await this.pullAndReconcile()
      this.lastError = null
      this.store.meta.set('last_synced_at', new Date(this.now()).toISOString())
      this.emit('idle')
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err)
      this.emit('error')
    } finally {
      this.running = false
    }
  }
}
