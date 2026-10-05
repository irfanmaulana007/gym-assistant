// In-memory LocalStore. Backs unit tests (the sync engine runs against this so
// its behaviour is identical to the on-device SQLite path) and serves as a
// no-persistence fallback. Rows are deep-cloned on write/read so callers can't
// mutate stored state by reference — matching what the SQLite store does when
// it (de)serializes rows.

import type { KeyValue, LocalStore, OutboxRecord, OutboxStore, Table } from './store'

function clone<T>(v: T): T {
  return v == null ? v : JSON.parse(JSON.stringify(v))
}

function makeTable<T extends { id: string }>(): Table<T> {
  const map = new Map<string, T>()
  return {
    all: () => [...map.values()].map(clone),
    get: (id) => {
      const v = map.get(id)
      return v ? clone(v) : undefined
    },
    upsert: (row) => {
      map.set(row.id, clone(row))
    },
    delete: (id) => {
      map.delete(id)
    },
    clear: () => map.clear(),
  }
}

function makeKeyValue(): KeyValue {
  const map = new Map<string, unknown>()
  return {
    get: <T>(key: string) => {
      const v = map.get(key)
      return v === undefined ? undefined : (clone(v) as T)
    },
    set: <T>(key: string, value: T) => {
      map.set(key, clone(value))
    },
    delete: (key) => {
      map.delete(key)
    },
  }
}

function makeOutbox(): OutboxStore {
  const map = new Map<string, OutboxRecord>()
  let seq = 0
  const sorted = () => [...map.values()].sort((a, b) => a.seq - b.seq).map(clone)
  return {
    all: sorted,
    due: (now) => sorted().filter((r) => r.next_attempt_at <= now),
    enqueue: (rec) => {
      const full: OutboxRecord = { ...clone(rec), seq: ++seq } as OutboxRecord
      map.set(full.id, full)
      return clone(full)
    },
    update: (rec) => {
      if (map.has(rec.id)) map.set(rec.id, clone(rec))
    },
    remove: (id) => {
      map.delete(id)
    },
    forEntity: (entityId) => sorted().filter((r) => r.entity_id === entityId),
    clear: () => {
      map.clear()
      seq = 0
    },
  }
}

export function createMemoryStore(): LocalStore {
  return {
    routines: makeTable(),
    exercises: makeTable(),
    sessions: makeTable(),
    sessionExercises: makeTable(),
    entries: makeTable(),
    meta: makeKeyValue(),
    outbox: makeOutbox(),
    // Memory store is synchronous; a "transaction" just runs the fn.
    transaction: (fn) => fn(),
  }
}
