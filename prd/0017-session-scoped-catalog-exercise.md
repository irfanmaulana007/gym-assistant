# PRD 0017 — Pick a Catalog Exercise Mid-Session (Session-Scoped)

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Approved |
| Created | 2026-10-01 |
| Updated | 2026-10-01 |
| App | api, web |
| Extends | [0002 Session Lifecycle](0002-session-lifecycle-and-metrics.md), [0006 Exercise Catalog](0006-exercise-catalog.md), [0014 Shared Exercise History](0014-shared-exercise-history-across-routines.md) |

## 1. Problem

Adding an exercise **during** a running workout session is a bare free-text box.
On the active-session screen (`apps/web/src/features/sessions/ActiveSessionPage.tsx`)
the "Add exercise" form takes only a typed name and hardcodes
`measurement_type: 'weight_reps'` and `primary_muscle_group: 'other'`
(`addMut`, ~line 71). The request has no `catalog_exercise_id`
(`AdHocExerciseInput`, `apps/web/src/api/sessions.ts`), so the on-the-spot
exercise:

- can't be picked from the shared catalog the way a routine exercise can — no
  search, no muscle-group grouping, no correct measurement type;
- is tagged `other`, so it never joins the muscle-group analytics correctly;
- its logged sets **never contribute to that movement's shared history or
  progressive-overload trend** (PRD 0014), because history keys on catalog
  identity and the ad-hoc row has no catalog link.

Meanwhile the catalog picker already exists and is used only when editing a
routine (`ExercisePickerSheet` → `RoutineDetailPage`). The two "add exercise"
flows are asymmetric.

### Concrete scenario

Mid-way through **Pull Day** the user decides to do **Pull Ups** (not in the
routine). They want to pick "Pull Ups" from the catalog, log weight × reps just
like a registered exercise, and have those sets count toward Pull Ups' history
and trend — **but Pull Ups must not be added to the routine** for next time; it
stays local to this one session.

## 2. Goals

- The mid-session **"Add exercise"** leads with the **catalog picker** (searchable
  list + muscle-group chips), reusing the existing picker UX. The picked movement
  carries its catalog name, muscle groups, and default measurement type — so the
  user logs weight/reps (or a duration, etc.) exactly like a registered exercise.
- The added exercise is **session-scoped**: it lives only in this session and is
  **never written back to the routine** (next session's checklist is unchanged).
- Because it is **catalog-linked**, its logged sets **join the movement's shared
  history and trend** (PRD 0014) — logging ad-hoc Pull Ups here shows up when you
  open Pull Ups' history from any routine.
- The mid-session picker is **catalog-only** — no free-text/custom escape hatch
  (a deliberate scoping decision for this surface).

### Non-goals

- **No new routine exercise.** We reuse the existing *ad-hoc* `session_exercises`
  mechanism (`exercise_id = NULL`); session-scoping already works this way.
- **Routine-detail "last time" and the dashboard** are not re-pointed at ad-hoc
  sets in this PRD. Ad-hoc catalog sets feed **exercise history/trend** and the
  **active-session "last time"** hint (§4.4); a routine exercise's *own*
  "last time" on the routine-detail screen keeps today's routine-only sources.
  (Mirrors how PRD 0014/0016 scoped history vs. the weight-to-beat surfaces
  incrementally.)
- **No custom (free-text) mid-session add.** Catalog-only per the decision above.
  The API keeps accepting a legacy free-text ad-hoc request for backward
  compatibility, but the web no longer offers it mid-session.

## 3. Definition — session-scoped, catalog-linked ad-hoc exercise

A `session_exercises` row with:

- `exercise_id = NULL` — not backed by any routine template (today's ad-hoc rule,
  so it never persists to the routine), **and**
- `catalog_exercise_id = <catalog id>` — new: links to the shared catalog entry,
  so its name / muscle groups / measurement type resolve from the catalog and its
  logged sets share the movement's identity (PRD 0014's "catalog id" rule).

## 4. Design

### 4.1 Data model (migration `0006`)

Add one nullable column to `session_exercises`:

```sql
ALTER TABLE session_exercises
  ADD COLUMN catalog_exercise_id UUID REFERENCES exercise_catalog(id) ON DELETE SET NULL;
```

- **Backward-compatible**: nullable, no backfill. Existing rows (routine snapshots
  and legacy free-text ad-hoc) keep `catalog_exercise_id = NULL`.
- Routine-snapshot rows (created on session start) continue to leave it `NULL` —
  their identity resolves through the routine `exercises` row as today. Only the
  new catalog-picked ad-hoc rows set it.

`domain.SessionExercise` gains `CatalogExerciseID *string`
(`json:"catalog_exercise_id"`), read by every `session_exercises` scan.

### 4.2 Add a catalog-linked ad-hoc exercise (API)

`POST /api/v1/sessions/{id}/exercises` gains an optional `catalog_exercise_id`:

- **With `catalog_exercise_id`** (the new happy path): the service validates the
  catalog row exists (→ `422` otherwise), and resolves the snapshot from it —
  `name` defaults to the catalog name (a caller override is allowed),
  `measurement_type` defaults to the catalog's `default_measurement_type`, and
  the **primary/secondary muscle groups are taken from the catalog** (any
  request muscle fields are ignored). The repo inserts the row with
  `exercise_id = NULL`, `catalog_exercise_id = <id>`, and the resolved snapshot.
- **Without `catalog_exercise_id`** (legacy/custom): unchanged — `name` required,
  muscle groups from the request (default `other`). Retained for backward
  compatibility and existing tests; the web no longer calls it mid-session.

This mirrors the routine add-exercise contract (PRD 0006 §4.3). The
`SessionService` gains the catalog reader dependency it needs
(`NewSessionService(repo, users, catalog)`), wired from the existing
`catalogRepo` in `app/app.go`.

### 4.3 Shared history includes ad-hoc catalog sets (API)

`ExerciseRepository.History` already merges sets across every routine exercise
that shares the viewed exercise's identity (PRD 0014). Extend it so that when the
viewed exercise is **catalog-linked**, the history also includes **ad-hoc session
sets with the same `catalog_exercise_id`**:

```sql
WHERE s.user_id = $2
  AND ( sx.exercise_id = ANY($1::uuid[])                        -- routine rows (unchanged)
        OR ($3::uuid IS NOT NULL AND sx.catalog_exercise_id = $3) ) -- ad-hoc, same catalog movement
```

`$3` is the viewed exercise's own `catalog_exercise_id` (resolved alongside the
existing peer lookup). The two branches are disjoint (routine rows never set
`sx.catalog_exercise_id`), so no double counting. A custom (unlinked) exercise is
unaffected (`$3` is `NULL`). This is bidirectional: opening Pull Ups' history from
a routine shows ad-hoc Pull Ups sets, and vice-versa. The derived trend
(`buildHistory`) just receives the merged rows — no change.

### 4.4 Active-session "last time" for the ad-hoc exercise (API)

So a mid-session catalog pick feels like a registered exercise, it shows the
**"Last time"** weight-to-beat drawn from the movement's prior sets. This is an
**additive** path in `SessionRepository.LastSetsBeforeSession` that leaves the
existing routine machinery (PRD 0014/0016) untouched:

1. Find the current session's ad-hoc catalog targets (`exercise_id IS NULL AND
   catalog_exercise_id IS NOT NULL`).
2. For their catalog ids, gather candidate weighted sets from the user's **other**
   sessions where the **resolved** catalog id
   (`COALESCE(sx.catalog_exercise_id, e.catalog_exercise_id)`) matches — i.e. both
   prior ad-hoc sets **and** routine sets of the same catalog movement.
3. Tag each candidate with the current ad-hoc row's `session_exercises.id` and
   reduce to the top set of the most recent session (`indexLastSets` /
   `pkg/overload`, unchanged).

`SessionService.load` then attaches `last_set` for ad-hoc rows by
`session_exercises.id` (routine rows keep matching by `exercise_id`). The derived
rule stays in `pkg/overload`; nothing is stored.

### 4.5 Web — catalog-only picker on the active session

The free-text add form on `ActiveSessionPage` is replaced by a **sheet-based
catalog picker**, reusing the `ExercisePickerSheet` UX (search field + muscle-group
chip row + grouped list + targets step) in a **catalog-only** mode:

- The picker is generalized to support two save targets via a small prop:
  routine add (today) vs. **session add** (new). In session mode it posts to
  `sessionsApi.addExercise(sessionId, { catalog_exercise_id, name, measurement_type,
  target_* })` and **omits the "Custom exercise" button**.
- Trigger: an "Add exercise" button on the active-session screen opens the sheet
  (native-mobile per `.claude/rules/native-mobile-ux.md` — full sheet, ≥44px rows,
  no popovers). On success the session query invalidates and the new row appears
  in the checklist, loggable immediately (`ExerciseCard` already renders weight/reps
  or duration inputs and the "Last time" hint off `measurement_type`/`last_set`).
- `AdHocExerciseInput` (`apps/web/src/api/sessions.ts`) gains
  `catalog_exercise_id?: string`.

## 5. Testing

Per [`.claude/rules/testing.md`](../.claude/rules/testing.md), ships unit **and**
e2e tests under the root `tests/` tree, on dedicated ports.

**API**

- **Unit** (`tests/unit-test/api/`): add-ad-hoc-with-`catalog_exercise_id`
  resolves name/measurement/muscle from the catalog and ignores request muscle
  fields; unknown `catalog_exercise_id` → `422`; the legacy free-text path still
  requires a name and defaults muscle `other`.
- **E2E** (`tests/e2e/api/`, embedded Postgres): start a session → add a catalog
  ad-hoc exercise (targets only) → it comes back with `exercise_id: null`,
  `catalog_exercise_id` set, and the catalog's name/muscle groups; log a weighted
  set → read the catalog exercise's `/history` **from a routine** and assert the
  ad-hoc set is included; assert the routine's next session checklist does **not**
  contain the ad-hoc exercise (session-scoped). Also assert the ad-hoc row's
  "last time" reflects a prior session's set of the same catalog movement.

**Web**

- **Unit** (`tests/unit-test/web/`): the session picker lists/filters/searches the
  catalog, has **no** "Custom exercise" button, and on save posts
  `catalog_exercise_id` + targets to the session add endpoint (not the routine one).
- **E2E** (`tests/e2e/web/`): start a session → "Add exercise" → pick a catalog
  movement → set targets → save → the new row appears in the checklist with the
  catalog name + muscle badge → log a set.

Each new test fails without the change and passes with it.

## 6. Rollout

1. **`[migration]`** — add `session_exercises.catalog_exercise_id`.
2. **`[api][feat]`** — add-ad-hoc-with-catalog contract + resolution, history
   inclusion, ad-hoc "last time", wiring, tests.
3. **`[web][feat]`** — catalog-only session picker + client/type change, tests.

No feature flag: the column is additive and nullable; the legacy free-text add
path is preserved on the API; existing ad-hoc rows remain valid.
