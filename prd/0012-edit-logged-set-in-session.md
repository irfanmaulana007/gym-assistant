# PRD 0012 — Edit a Logged Set During a Running Session

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Approved |
| Created | 2026-09-15 |
| Updated | 2026-09-15 |
| App | web |
| Extends | [PRD 0002 — Session Lifecycle, Exercise Types & Metrics](0002-session-lifecycle-and-metrics.md) |

## 1. Summary

While a workout session is running, a user must be able to **fix a set they
just logged** — a mistyped weight or rep count — without abandoning the set or
the session. Today the logged sets on the active-session screen render as
**read-only pills**; a typo can only be worked around by logging another
(also wrong) set.

This is a **web-only** change. The API already exposes everything needed —
`PATCH /api/v1/entries/{id}` ("Edit an entry") and `DELETE /api/v1/entries/{id}`
from [PRD 0002 §7](0002-session-lifecycle-and-metrics.md#7-api-changes), and the
web client already wraps them (`sessionsApi.updateEntry` / `sessionsApi.removeEntry`
in `src/api/sessions.ts`). No backend, schema, or API-client work is required —
the only gap is the UI affordance to reach those calls.

## 2. Motivation

Logging happens fast and one-handed at the gym (the `ExerciseCard` inline-input
exception to the "forms live in a sheet" rule exists precisely for speed). Fast
input means fat-finger mistakes: `600kg` instead of `60`, `8` reps typed as `88`.
A wrong `SetEntry` skews the session's derived metrics — volume, top set, the
"weight to beat" surfaced next time — so leaving it wrong is not cosmetic.

The backend has supported editing and deleting an entry since PRD 0002, and
PRD 0004 already established the precedent of a small web-only PRD to *surface* an
edit/delete capability the API had but the UI didn't. This PRD does the same for
the in-session set list.

## 3. Scope

**In scope (web):**

- On the active-session screen (`ExerciseCard`), make each already-logged set
  **editable in place**: tap **Edit** on a set pill to reveal inline inputs
  pre-filled with the set's current values, then **Save** the correction.
- **Delete** a logged set, guarded behind the same Edit affordance (so it can't
  be hit by accident during a workout) — no separate confirm dialog.
- Works for both **weight × reps** sets and **duration** bouts.

**Out of scope:**

- Any API / schema / API-client change (all already exist).
- Editing sets of a **completed / paused** session — the edit affordance follows
  the existing logging inputs and only appears while the session is editable
  (`!disabled`).
- Re-ordering sets, changing a set's `entry_number`, or editing
  distance/incline/speed/RPE (not surfaced in the logging UI this phase).
- Changing a set's weight **unit** on edit — the set keeps the unit it was logged
  with; only the numeric values are corrected.

## 4. Design

### 4.1 Inline edit, honoring fast-logging

Set logging is a documented inline exception to the "forms live in a sheet" rule
(`apps/web/CLAUDE.md`). **Correcting** a set is part of that same fast in-session
flow, so it stays inline too — a `Sheet` would be heavier than the fix warrants.

Each logged-set pill (`.entry-row`) gains a small **Edit** button. Tapping it
switches that one row into an editing state:

- **weight × reps** → a weight input and a reps input, pre-filled with the set's
  current values, plus **Save** / **Cancel** / **Delete**.
- **duration** → a minutes input pre-filled from `duration_seconds`, plus the
  same three controls.

**Save** calls `sessionsApi.updateEntry(entry.id, patch)` sending only the edited
numeric fields (`{ weight, reps }` or `{ duration_seconds }`); the API applies a
partial `COALESCE` patch, so the set's unit and other columns are preserved.
**Delete** calls `sessionsApi.removeEntry(entry.id)`. **Cancel** discards the edit
and restores the read-only pill. On success the `['session', sessionId]` query is
invalidated so the list, per-exercise aggregates, and "weight to beat" refresh.

Only one control at a time is needed; multiple exercise cards may each have a row
in edit mode independently. Accessible labels include the exercise name and set
number so each control is unambiguous.

### 4.2 Validation

Mirrors the create path: a weight×reps edit requires `reps`; a duration edit
requires a non-zero minutes value. An empty/invalid edit is a no-op (Save does
nothing), matching how `logSet()` already guards.

## 5. Testing

Per [`.claude/rules/testing.md`](../.claude/rules/testing.md), ships with unit
**and** e2e tests under the root `tests/` tree:

- **Unit** (`tests/unit-test/web/`): the `ExerciseCard` entry pill exposes an Edit
  control that pre-fills the current weight/reps, Save issues a
  `PATCH /api/v1/entries/{id}`, and Delete issues a `DELETE /api/v1/entries/{id}`.
- **E2E** (`tests/e2e/web/`): start a session, log a wrong set (e.g. `600 × 8`),
  edit it down to the correct value (`60 × 8`), and assert the corrected value is
  shown and round-trips.

## 6. Rollout

Single web PR. No migration, no API change, no feature flag.
