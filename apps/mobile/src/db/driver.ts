// Minimal synchronous SQLite driver interface the SQLite store depends on.
// op-sqlite (the app) satisfies this via driver.native.ts; keeping the store
// behind this interface means the store logic has no hard dependency on the
// native module.

export interface SqlResult {
  rows: Record<string, unknown>[]
  rowsAffected: number
}

export interface SqliteDriver {
  execute(sql: string, params?: unknown[]): SqlResult
  transaction(fn: () => void): void
  close(): void
}
