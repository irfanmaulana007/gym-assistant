// The app's single LocalStore instance (the source of truth). On-device it is
// SQLite-backed (op-sqlite); it falls back to the in-memory store if the native
// module is unavailable (e.g. a misconfigured dev build) so the UI still runs.

import { createMemoryStore } from './memoryStore'
import { createSqliteStore } from './sqliteStore'
import type { LocalStore } from './store'

let instance: LocalStore | null = null

export function getStore(): LocalStore {
  if (instance) return instance
  try {
    // Lazy require so unit tests / non-native contexts never load op-sqlite.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { openSqliteDriver } = require('./driver.native') as typeof import('./driver.native')
    instance = createSqliteStore(openSqliteDriver())
  } catch {
    instance = createMemoryStore()
  }
  return instance
}

export * from './store'
export * from './repositories'
