import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStore } from '@/db/memoryStore'
import { SyncWorker } from '@/sync/worker'
import { SyncError } from '@/sync/types'
import type { ServerSnapshot } from '@/sync/types'
import type { LocalStore, OutboxEntity, OutboxOp, OutboxRecord } from '@/db/store'
import type { Routine, SetEntry } from '@/types/api'

let store: LocalStore
beforeEach(() => {
  store = createMemoryStore()
})

function queue(entity: OutboxEntity, op: OutboxOp, entity_id: string): void {
  store.outbox.enqueue({
    id: `o-${entity_id}-${op}`,
    entity,
    op,
    entity_id,
    payload: {},
    base_version: null,
    created_at: '',
    state: 'pending',
    attempts: 0,
    next_attempt_at: 0,
    last_error: null,
  })
}

const emptySnapshot: ServerSnapshot = {
  routines: [],
  exercises: [],
  sessions: [],
  sessionExercises: [],
  entries: [],
}

describe('SyncWorker — outbox drain (PRD 0018 §4.5)', () => {
  it('drains pending records in strict seq order', async () => {
    const order: string[] = []
    queue('routine', 'create', 'a')
    queue('routine', 'create', 'b')
    queue('entry', 'create', 'c')
    const worker = new SyncWorker({
      store,
      push: async (r) => {
        order.push(r.entity_id)
      },
      pull: async () => emptySnapshot,
      now: () => 0,
    })
    const pushed = await worker.drainOutbox()
    expect(pushed).toBe(3)
    expect(order).toEqual(['a', 'b', 'c'])
    expect(store.outbox.all()).toHaveLength(0)
  })

  it('a replayed create is idempotent on an id-keyed server (no duplicate)', async () => {
    const server = new Set<string>()
    queue('routine', 'create', 'dup')
    queue('routine', 'create', 'dup') // a replay of the same client id
    const worker = new SyncWorker({
      store,
      push: async (r) => {
        server.add(r.entity_id) // server upserts by client id
      },
      pull: async () => emptySnapshot,
      now: () => 0,
    })
    await worker.drainOutbox()
    expect(server.size).toBe(1)
  })

  it('stops on the first retryable failure and backs the record off (order preserved)', async () => {
    queue('routine', 'create', 'a')
    queue('routine', 'update', 'b')
    queue('entry', 'create', 'c')
    const worker = new SyncWorker({
      store,
      push: async (r) => {
        if (r.entity_id === 'b') throw new SyncError('offline', { retryable: true })
      },
      pull: async () => emptySnapshot,
      now: () => 1000,
      backoff: () => 5000,
    })
    const pushed = await worker.drainOutbox()
    expect(pushed).toBe(1) // only 'a'
    const remaining = store.outbox.all()
    expect(remaining.map((r) => r.entity_id)).toEqual(['b', 'c']) // nothing reordered/dropped
    const b = remaining.find((r) => r.entity_id === 'b')!
    expect(b.attempts).toBe(1)
    expect(b.next_attempt_at).toBe(6000)
    expect(b.state).toBe('failed')
  })

  it('drops a non-retryable (hard 4xx) record to the conflict log and continues', async () => {
    queue('routine', 'create', 'a')
    queue('routine', 'update', 'b')
    queue('entry', 'create', 'c')
    const worker = new SyncWorker({
      store,
      push: async (r) => {
        if (r.entity_id === 'b') throw new SyncError('validation failed', { retryable: false, status: 422 })
      },
      pull: async () => emptySnapshot,
      now: () => 0,
    })
    const pushed = await worker.drainOutbox()
    expect(pushed).toBe(2) // a and c
    expect(store.outbox.all()).toHaveLength(0)
    expect(worker.conflicts.map((c) => c.record.entity_id)).toEqual(['b'])
  })

  it('does nothing while offline', async () => {
    queue('routine', 'create', 'a')
    const push = vi.fn(async () => {})
    const worker = new SyncWorker({ store, push, pull: async () => emptySnapshot, isOnline: () => false })
    expect(await worker.drainOutbox()).toBe(0)
    expect(push).not.toHaveBeenCalled()
  })
})

describe('SyncWorker — pull reconcile (LWW + tombstones, PRD 0018 §4.5)', () => {
  const routine = (id: string, name: string, updated_at: string): Routine => ({
    id,
    user_id: 'u1',
    name,
    notes: '',
    position: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at,
  })

  it('adopts a newer server row, keeps a newer pending local edit, and tombstones vanished rows', async () => {
    // r1: synced locally, server has a newer edit → server wins
    store.routines.upsert(routine('r1', 'Old name', '2026-01-01T00:00:00Z'))
    // r2: local-only, no pending create → tombstoned (deleted on server)
    store.routines.upsert(routine('r2', 'Vanished', '2026-01-01T00:00:00Z'))
    // r3: local-only WITH a pending create → kept (not yet pushed)
    store.routines.upsert(routine('r3', 'Brand new', '2026-01-01T00:00:00Z'))
    queue('routine', 'create', 'r3')
    // r4: local edit newer than server + pending update → local wins (keep local name)
    store.routines.upsert(routine('r4', 'Local edit', '2026-03-01T00:00:00Z'))
    queue('routine', 'update', 'r4')

    const snapshot: ServerSnapshot = {
      ...emptySnapshot,
      routines: [routine('r1', 'New name', '2026-02-01T00:00:00Z'), routine('r4', 'Server stale', '2026-02-01T00:00:00Z')],
    }
    const worker = new SyncWorker({ store, push: async () => {}, pull: async () => snapshot, now: () => 0 })
    await worker.pullAndReconcile()

    expect(store.routines.get('r1')?.name).toBe('New name') // server newer → adopted
    expect(store.routines.get('r2')).toBeUndefined() // tombstoned
    expect(store.routines.get('r3')?.name).toBe('Brand new') // pending create → kept
    expect(store.routines.get('r4')?.name).toBe('Local edit') // newer local edit → kept
  })

  it('append-only set entries from two devices both survive a pull', async () => {
    const entry = (id: string): SetEntry => ({
      id,
      session_exercise_id: 'se1',
      entry_number: 1,
      weight: 100,
      weight_unit: 'kg',
      reps: 8,
      duration_seconds: null,
      distance: null,
      distance_unit: null,
      incline: null,
      speed: null,
      rpe: null,
      is_completed: true,
      performed_at: '2026-02-01T00:00:00Z',
      metadata: {},
      created_at: '2026-02-01T00:00:00Z',
    })
    // This device logged e-local (pending create, not yet on server).
    store.entries.upsert(entry('e-local'))
    queue('entry', 'create', 'e-local')
    // The server pull returns another device's entry e-remote (distinct id).
    const snapshot: ServerSnapshot = { ...emptySnapshot, entries: [entry('e-remote')] }
    const worker = new SyncWorker({ store, push: async () => {}, pull: async () => snapshot, now: () => 0 })
    await worker.pullAndReconcile()

    expect(store.entries.get('e-local')).toBeDefined() // pending create preserved
    expect(store.entries.get('e-remote')).toBeDefined() // other device's set adopted
    expect(store.entries.all()).toHaveLength(2)
  })
})
