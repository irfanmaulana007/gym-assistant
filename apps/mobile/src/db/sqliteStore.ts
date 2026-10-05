// Durable LocalStore backed by a SqliteDriver (op-sqlite on-device). Mirrors the
// memoryStore semantics exactly — rows (de)serialize through the `data` JSON
// column — so the sync engine and repositories behave identically whether
// pointed at memory (tests) or SQLite (app). This adapter is only loaded on the
// device; unit tests use createMemoryStore.

import type { SqliteDriver } from './driver'
import { ENTITY_TABLES, SCHEMA_SQL, type EntityTable } from './schema'
import type { KeyValue, LocalStore, OutboxRecord, OutboxStore, Table } from './store'

function entityTable<T extends { id: string; updated_at?: string }>(
  driver: SqliteDriver,
  table: EntityTable,
): Table<T> {
  return {
    all: () => driver.execute(`SELECT data FROM ${table}`).rows.map((r) => JSON.parse(r.data as string) as T),
    get: (id) => {
      const rows = driver.execute(`SELECT data FROM ${table} WHERE id = ?`, [id]).rows
      return rows.length ? (JSON.parse(rows[0].data as string) as T) : undefined
    },
    upsert: (row) => {
      driver.execute(
        `INSERT INTO ${table} (id, updated_at, data) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data`,
        [row.id, row.updated_at ?? null, JSON.stringify(row)],
      )
    },
    delete: (id) => {
      driver.execute(`DELETE FROM ${table} WHERE id = ?`, [id])
    },
    clear: () => {
      driver.execute(`DELETE FROM ${table}`)
    },
  }
}

function rowToOutbox(r: Record<string, unknown>): OutboxRecord {
  return {
    id: r.id as string,
    seq: Number(r.seq),
    entity: r.entity as OutboxRecord['entity'],
    op: r.op as OutboxRecord['op'],
    entity_id: r.entity_id as string,
    payload: JSON.parse(r.payload as string),
    base_version: (r.base_version as string | null) ?? null,
    created_at: r.created_at as string,
    state: r.state as OutboxRecord['state'],
    attempts: Number(r.attempts),
    next_attempt_at: Number(r.next_attempt_at),
    last_error: (r.last_error as string | null) ?? null,
  }
}

function outboxStore(driver: SqliteDriver): OutboxStore {
  const write = (rec: OutboxRecord) => {
    driver.execute(
      `INSERT INTO outbox (id, seq, entity, op, entity_id, payload, base_version, created_at, state, attempts, next_attempt_at, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET seq=excluded.seq, entity=excluded.entity, op=excluded.op, entity_id=excluded.entity_id,
         payload=excluded.payload, base_version=excluded.base_version, created_at=excluded.created_at,
         state=excluded.state, attempts=excluded.attempts, next_attempt_at=excluded.next_attempt_at, last_error=excluded.last_error`,
      [
        rec.id,
        rec.seq,
        rec.entity,
        rec.op,
        rec.entity_id,
        JSON.stringify(rec.payload),
        rec.base_version,
        rec.created_at,
        rec.state,
        rec.attempts,
        rec.next_attempt_at,
        rec.last_error,
      ],
    )
  }
  return {
    all: () => driver.execute(`SELECT * FROM outbox ORDER BY seq ASC`).rows.map(rowToOutbox),
    due: (now) =>
      driver
        .execute(`SELECT * FROM outbox WHERE next_attempt_at <= ? ORDER BY seq ASC`, [now])
        .rows.map(rowToOutbox),
    enqueue: (rec) => {
      const nextSeq = Number(driver.execute(`SELECT COALESCE(MAX(seq), 0) + 1 AS s FROM outbox`).rows[0].s)
      const full: OutboxRecord = { ...rec, seq: nextSeq } as OutboxRecord
      write(full)
      return full
    },
    update: (rec) => write(rec),
    remove: (id) => {
      driver.execute(`DELETE FROM outbox WHERE id = ?`, [id])
    },
    forEntity: (entityId) =>
      driver.execute(`SELECT * FROM outbox WHERE entity_id = ? ORDER BY seq ASC`, [entityId]).rows.map(rowToOutbox),
    clear: () => {
      driver.execute(`DELETE FROM outbox`)
    },
  }
}

function metaStore(driver: SqliteDriver): KeyValue {
  return {
    get: <T>(key: string) => {
      const rows = driver.execute(`SELECT value FROM meta WHERE key = ?`, [key]).rows
      return rows.length ? (JSON.parse(rows[0].value as string) as T) : undefined
    },
    set: <T>(key: string, value: T) => {
      driver.execute(
        `INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, JSON.stringify(value)],
      )
    },
    delete: (key) => {
      driver.execute(`DELETE FROM meta WHERE key = ?`, [key])
    },
  }
}

export function createSqliteStore(driver: SqliteDriver): LocalStore {
  for (const stmt of SCHEMA_SQL) driver.execute(stmt)
  const [routines, exercises, sessions, sessionExercises, entries] = ENTITY_TABLES.map((t) =>
    entityTable(driver, t),
  ) as [
    Table<LocalStore['routines'] extends Table<infer R> ? R : never>,
    Table<LocalStore['exercises'] extends Table<infer R> ? R : never>,
    Table<LocalStore['sessions'] extends Table<infer R> ? R : never>,
    Table<LocalStore['sessionExercises'] extends Table<infer R> ? R : never>,
    Table<LocalStore['entries'] extends Table<infer R> ? R : never>,
  ]
  return {
    routines,
    exercises,
    sessions,
    sessionExercises,
    entries,
    meta: metaStore(driver),
    outbox: outboxStore(driver),
    transaction: (fn) => driver.transaction(fn),
  }
}
