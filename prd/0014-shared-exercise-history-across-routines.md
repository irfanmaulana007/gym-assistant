# PRD 0014 — Shared Exercise History Across Routines

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Approved |
| Created | 2026-09-15 |
| Updated | 2026-09-15 |
| App | api |
| Related PRs | (this change) |
| Related docs | [0006 Exercise Catalog](0006-exercise-catalog.md), [0001 Workout Tracking Foundation](0001-workout-tracking-foundation.md) |

## 1. Problem

The same movement shows **different history depending on which workout group it
is opened from**. On production, "Lateral Raise" opened from the *Upper* routine
shows a weight history, but "Lateral Raise" opened from the *Push* routine shows
nothing — even though the user thinks of it as one exercise with one progression.

### Root cause

`exercises` rows are **per-routine** (`exercises.routine_id`, migration
`0001_initial_schema.sql`). Adding the same movement to two routines creates
**two rows with two different UUIDs**. Logged sets attach to
`session_exercises.exercise_id`, i.e. whichever per-routine row was in the
session. The history endpoint filters strictly on that single id:

```sql
-- apps/api/internal/repository/exercise_repo.go (History), before
WHERE sx.exercise_id = $1 AND s.user_id = $2
```

So "Lateral Raise" in *Push* only ever sees sets logged under *Push*'s row. The
shared `exercise_catalog` link (`exercises.catalog_exercise_id`, PRD 0006) exists
but was only used for metadata (name, muscle groups), never for history.

## 2. Goals

- Opening an exercise's history from **any** routine shows the **combined**
  weight history and derived progression for that movement across every routine
  it appears in.
- No schema change, no migration, no denormalized/stored progression (progressive
  overload stays **derived**, per the core domain rules).
- No cross-user leakage; every query stays scoped to the authenticated user.

### Non-goals (this PRD)

- The **"weight to beat"** hint on the running session (`LastSetsByRoutine`) and
  the **dashboard trend/records** endpoints remain per-routine for now. They can
  adopt the same shared-identity rule in a follow-up; this PRD is scoped to the
  exercise **history** view, which is the reported surface.
- No merging of exercise *definitions* (targets, notes) across routines — each
  routine keeps its own exercise row and its own targets. Only **history** is
  shared.
- No UI change: the existing history screen renders the merged sessions as-is.

## 3. Definition — "the same exercise"

Two per-routine exercise rows are the **same movement** (their history merges)
when, for exercises owned by the same user:

1. **Both are catalog-linked** → same iff they point at the **same
   `catalog_exercise_id`**. (Name differences like "Lateral Raise" vs "Side
   Lateral Raise" don't matter — the deliberate catalog link wins.)
2. **Both are custom** (no catalog link) → same iff their **normalized names**
   match, where normalize = lowercase + trim surrounding whitespace
   (`lower(btrim(name))`).
3. **One linked, one custom** → never the same (a deliberate link is a stronger
   signal than an incidental name collision).

This is the "catalog id, else name" rule chosen during design review.

## 4. Design

Single change, in the repository layer.

- New pure package `apps/api/pkg/exercise` with `NormalizeName(name)` and
  `SameIdentity(catalogIDA, nameA, catalogIDB, nameB)` — the one rule from §3,
  dependency-free so both the repository and the unit tests can use it.
- `ExerciseRepository.History` now resolves the **peer set**: all of the user's
  exercise rows that share identity with the requested exercise (via
  `SameIdentity`), then reads `set_entries` for `sx.exercise_id = ANY(peers)`.
  Grouping runs in Go (one normalization source of truth) over the user's own
  exercises (a small set); ownership is enforced by joining `routines.user_id`.
- No change to the service, handler, route, response shape, or the web app. The
  derived per-session top set / volume / trend (`buildHistory`) is unchanged; it
  simply receives the merged rows.

### Data flow (after)

```
GET /exercises/{id}/history
  → service.History (unchanged: GetByID for the exercise, then repo.History)
    → repo.peerExerciseIDs(user, id)  = exercises sharing identity (catalog|name)
    → repo.History = set_entries for ANY(peer ids), scoped to user, oldest first
  → buildHistory → sessions + trend (derived, never stored)
```

## 5. Testing

- **Unit** (`tests/unit-test/api/exercise_identity_test.go`) — `NormalizeName`
  folding and every branch of `SameIdentity` (same catalog id, different catalog
  ids, custom name match incl. case/space, custom name mismatch, linked-vs-custom
  never merge).
- **E2E** (`tests/e2e/api/shared_history_test.go`) —
  - *Catalog-linked*: same catalog movement in two routines, a session logged in
    each; history opened from **either** routine returns both sessions (oldest
    first) with the correct derived top sets and an "up" trend.
  - *Custom by name*: same custom name (with case/space difference) in two
    routines merges; a differently-named exercise stays separate and does not
    leak in.
- **Reproduce-first**: both e2e tests were confirmed RED against the old
  per-`exercise_id` query (`sessions = 1, want 2`) and GREEN with the fix.

## 6. Rollout & risk

- **No migration**, no data backfill — pure read-path change. Fully backward
  compatible: an exercise that appears in only one routine returns exactly what
  it did before.
- **Risk**: two *unrelated* custom exercises that happen to share a normalized
  name would merge. Accepted: this matches the user's mental model ("same name =
  same exercise") and only affects custom, non-catalog exercises; users who want
  them separate can rename or link to distinct catalog entries.
