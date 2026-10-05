// op-sqlite adapter — the on-device SqliteDriver. Only imported on the device
// (never by unit tests, which use the in-memory store), so the native module is
// loaded lazily here.

import { open, type DB } from '@op-engineering/op-sqlite'
import type { SqliteDriver, SqlResult } from './driver'

const DB_NAME = 'gym-assistant.sqlite'

export function openSqliteDriver(): SqliteDriver {
  const db: DB = open({ name: DB_NAME })
  return {
    execute(sql: string, params: unknown[] = []): SqlResult {
      const res = db.executeSync(sql, params as never[])
      return {
        rows: (res.rows ?? []) as Record<string, unknown>[],
        rowsAffected: res.rowsAffected ?? 0,
      }
    },
    transaction(fn: () => void): void {
      db.executeSync('BEGIN')
      try {
        fn()
        db.executeSync('COMMIT')
      } catch (err) {
        db.executeSync('ROLLBACK')
        throw err
      }
    },
    close(): void {
      db.close()
    },
  }
}
