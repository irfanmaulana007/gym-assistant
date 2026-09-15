# PRD 0015 — Shared "Last Set to Beat" Across Routines

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Approved |
| Created | 2026-09-15 |
| Updated | 2026-09-15 |
| App | api |
| Related PRs | (this change) |
| Related docs | [0014 Shared Exercise History Across Routines](0014-shared-exercise-history-across-routines.md), [0006 Exercise Catalog](0006-exercise-catalog.md) |

## 1. Problem

The **"last set to beat"** (`last_set` — the heaviest set of the most recent
prior session, shown as the starting weight when logging) is **per-routine**. A
movement done on one workout day shows no starting weight when the same movement
is opened on another day. Reported: a Lateral Raise logged on *Upper* day shows
**no last weight** on *Push* day, so there is nothing to mark as the starting
weight while performing the same exercise there.

This is the direct sibling of [PRD 0014](0014-shared-exercise-history-across-routines.md),
which made **history** shared across routines but explicitly left `last_set`
per-routine as a non-goal. This PRD closes that gap.

### Root cause

`last_set` is derived by two repository reads, both scoped to a single routine /
session's exercise ids and keyed by the per-routine `exercises.id`:

- `ExerciseRepository.LastSetsByRoutine` → routine-detail `last_set`
  (`WHERE e.routine_id = $1`).
- `SessionRepository.LastSetsBeforeSession` → running-session checklist
  `last_set` (`sx.exercise_id IN (this session's exercises)`).

Both feed `service.indexLastSets`, which reduces candidate rows per exercise id.
Because candidates only ever came from the current routine's own exercise rows, a
set logged for the same movement in another routine was never a candidate.

## 2. Goals

- The `last_set` for an exercise reflects the most recent top set of the **same
  movement** logged in **any** of the user's routines — on both surfaces that
  show it (routine detail **and** the running-session checklist).
- Reuse the **same identity rule** as PRD 0014 ("catalog id, else normalized
  name") so history and last-set agree on what "the same exercise" means.
- No schema change / migration; progression stays **derived**. No response-shape
  change; no web change.
- Keep the existing guarantees: the in-progress session never counts as its own
  "weight to beat"; ad-hoc (unlinked) entries are excluded; every query stays
  scoped to the authenticated user.

### Non-goals

- The dashboard trend/records endpoints (separate read models) are unchanged.
- No change to how a top set is chosen within a session (`pkg/overload`).

## 3. Design

One idea, applied to both reads: **fetch candidate sets from all peer exercises
(same identity), then attribute each candidate back to the target exercise id the
caller displays**, so `indexLastSets` reduces per displayed exercise unchanged.

- `pkg/exercise` gains `IdentityKey(catalogID, name)` — an O(n) bucketing key
  (`"cat:"+id` when linked, else `"name:"+NormalizeName(name)`); `SameIdentity`
  now delegates to it so the two never disagree.
- New repository helper `loadUserExerciseIdentities(user)` buckets all of the
  user's exercises by identity key, exposing:
  - `peerIDsForTargets(targetIDs)` — every exercise id sharing identity with any
    target (the candidate pool);
  - `retagByIdentity(candidates, targetIDs)` — re-tags each candidate set (by its
    source exercise's identity) onto the matching target exercise id(s).
- `LastSetsByRoutine` / `LastSetsBeforeSession` now: resolve the target exercise
  ids (routine's / session's), fetch weighted sets for `ANY(peer ids)` (the
  session read still excludes the current session), then `retagByIdentity`. The
  service (`indexLastSets`), handlers, routes, response shape, and web are
  untouched.

### Data flow (after)

```
routine detail          GET /routines/{id}
  → LastSetsByRoutine: targets = routine's exercises
      → peers = exercises sharing identity (all routines)
      → weighted sets for ANY(peers), user-scoped → retag onto target ids
  → indexLastSets → last_set per exercise (unchanged reducer)

running session         POST /routines/{id}/sessions, GET /sessions/{id}
  → LastSetsBeforeSession: targets = session's exercises, exclude current session
      → same peer fetch + retag
  → indexLastSets → last_set per checklist item
```

## 4. Testing

- **Unit** (`tests/unit-test/api/exercise_identity_test.go`) — `IdentityKey`:
  catalog vs custom keys, no linked/custom collision, and key-equality agrees
  with `SameIdentity`.
- **E2E** (`tests/e2e/api/shared_lastset_test.go`):
  - *Routine detail* — a session logged only on *Upper* seeds the `last_set` on
    the *Push* copy, for both a catalog-linked movement and a custom same-name
    movement; an unrelated exercise gets no `last_set`.
  - *Active session* — completing the movement on *Upper* (top 15×12) surfaces
    15×12 as the checklist `last_set` when the same movement is started on *Push*.
  - Existing `TestLastSet_E2E` (single-routine, in-progress-session exclusion)
    still passes — no regression.
- **Reproduce-first**: the new e2e tests were confirmed RED against the old
  routine-scoped candidate set ("no last_set; expected the other routine's top
  set") and GREEN with the fix.

## 5. Rollout & risk

- **No migration**, pure read-path change; fully backward compatible for
  single-routine movements.
- **Risk**: two unrelated custom exercises sharing a normalized name would share
  a last set — the same accepted trade-off as PRD 0014 (custom, non-catalog
  only; resolved by renaming or linking to distinct catalog entries).
