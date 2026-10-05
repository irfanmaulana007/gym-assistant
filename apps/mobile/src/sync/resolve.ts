// Conflict policy — last-write-wins (LWW) by updated_at (PRD 0018 §4.5).
//
// Single-user data plus append-only set logs make conflicts rare and low-stakes,
// so we resolve them with a timestamp comparison rather than a CRDT/OT merge
// (an explicit non-goal). The rules, straight from the PRD:
//
//   - Entity edits use LWW by `updated_at`: when a pull returns a server row
//     newer than the local unsynced edit, the server wins and the local edit is
//     dropped; when the local edit is newer, the local (outbox) side wins.
//   - A row with NO pending local mutation always takes the server copy (the
//     server is the source of truth for already-synced rows).
//   - Deletes win over concurrent edits (handled in the worker's tombstone pass).

export type Resolution = 'server' | 'local'

interface Versioned {
  updated_at?: string | null
}

/** Parse an ISO timestamp to epoch ms; unparseable/absent sorts oldest. */
export function versionTime(v: Versioned | null | undefined): number {
  const t = v?.updated_at ? Date.parse(v.updated_at) : NaN
  return Number.isNaN(t) ? -Infinity : t
}

/**
 * Decide which side wins when a server row and a local row for the same id meet
 * on pull.
 *
 * @param local   the local row (undefined if the row is server-only)
 * @param server  the server row (undefined if the row is local-only)
 * @param hasPendingLocalMutation  true when the outbox still holds an unsynced
 *        create/update for this id
 */
export function resolveLWW(
  local: Versioned | undefined,
  server: Versioned | undefined,
  hasPendingLocalMutation: boolean,
): Resolution {
  // Server-only row: adopt it. Local-only row: keep it.
  if (!local) return 'server'
  if (!server) return 'local'

  // An already-synced local row defers to the server unconditionally.
  if (!hasPendingLocalMutation) return 'server'

  // Both sides changed. Newer updated_at wins; a tie defers to the server so
  // the outcome is deterministic across devices.
  return versionTime(local) > versionTime(server) ? 'local' : 'server'
}
