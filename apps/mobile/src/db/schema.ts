// SQLite schema for the on-device source of truth (PRD 0018 §4.5). Each domain
// table stores the API entity shape as JSON in a `data` column keyed by id — the
// store (de)serializes at the boundary — plus a denormalized `updated_at` for
// cheap LWW ordering. The outbox is fully columnar so it can be queried by
// seq/state/entity without parsing JSON. All of it lives in SQLite so the queue
// survives app kills.

export const SCHEMA_VERSION = 1

export const ENTITY_TABLES = [
  'routines',
  'exercises',
  'sessions',
  'session_exercises',
  'entries',
] as const

export type EntityTable = (typeof ENTITY_TABLES)[number]

export const SCHEMA_SQL: string[] = [
  ...ENTITY_TABLES.map(
    (t) => `CREATE TABLE IF NOT EXISTS ${t} (
      id TEXT PRIMARY KEY NOT NULL,
      updated_at TEXT,
      data TEXT NOT NULL
    );`,
  ),
  `CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY NOT NULL,
    seq INTEGER NOT NULL,
    entity TEXT NOT NULL,
    op TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    base_version TEXT,
    created_at TEXT NOT NULL,
    state TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
  );`,
  `CREATE INDEX IF NOT EXISTS outbox_seq ON outbox (seq);`,
  `CREATE INDEX IF NOT EXISTS outbox_entity_id ON outbox (entity_id);`,
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );`,
]
