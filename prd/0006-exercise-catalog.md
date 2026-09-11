# PRD 0006 — Exercise Catalog (Master Data)

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Draft |
| Created | 2026-09-11 |
| Updated | 2026-09-11 |
| App | api, web |
| Extends | [PRD 0001 — Workout Tracking Foundation](0001-workout-tracking-foundation.md), [PRD 0002 — Session Lifecycle, Exercise Types & Metrics](0002-session-lifecycle-and-metrics.md) |

## 1. Summary

Introduce a shared **exercise catalog** — seeded master data — so that when a user
adds an exercise to a routine they **pick a known movement** (Bench Press, Deadlift,
…) instead of re-typing its name and re-selecting its muscle groups every time. Each
catalog entry carries the movement's canonical metadata: a **primary muscle group**
and zero or more **secondary muscle groups** (and a default measurement type). The
user's job shrinks to picking the exercise and entering the per-workout values
(target sets/reps, weight, etc.).

Two ways to add an exercise to a routine remain:

1. **Pick from the catalog** (the happy path) — the routine exercise stores a
   `catalog_exercise_id` and its muscle groups are **resolved live from the catalog**.
2. **Add a custom exercise** — the existing free-text flow (type a name, pick muscle
   groups) is preserved for movements not in the catalog. A custom exercise has no
   `catalog_exercise_id` and owns its muscle-group columns.

This spans **api** (new global catalog table + seed + read endpoint + link column on
`exercises` + resolve-on-read) and **web** (an exercise picker that replaces the
name/muscle inputs on the catalog path, with a "custom exercise" escape hatch).

## 2. Motivation

Today an exercise is **routine-local, duplicated, and hand-typed**. There is no shared
exercise identity: adding "Bench Press" to Push Day and again to Upper Day creates two
unrelated rows, each requiring the user to retype the name and re-pick `chest` as the
muscle group (`RoutineDetailPage` add-exercise sheet → `ExerciseFormFields`). This is
tedious on a phone, invites typos and inconsistent muscle-group tagging, and makes any
future "train each muscle group N times a week" analysis unreliable because the same
movement is tagged differently across routines.

The schema is already **most of the way there** — `exercises` has
`primary_muscle_group` and `secondary_muscle_groups[]` backed by the `muscle_group`
enum (mirrored in `pkg/vocab` and `web/src/types/api.ts`). What is missing is the
**master data** and the pick-don't-type flow. This PRD adds exactly that.

## 3. Scope

**In scope:**

- **api** — a new global `exercise_catalog` table, seeded (migration `0002`) with a
  focused starter set (~40–60 well-known movements), each with `primary_muscle_group`,
  `secondary_muscle_groups[]`, and a `default_measurement_type`.
- **api** — a read-only, auth-required **list endpoint** `GET /api/v1/exercise-catalog`
  with optional `?search=` and `?muscle_group=` filters.
- **api** — add a nullable `catalog_exercise_id` FK to `exercises`; when set, the
  API **resolves** `primary_muscle_group` / `secondary_muscle_groups` from the catalog
  on read (reference-only, no copy). Custom exercises keep their own columns.
- **api** — session snapshotting (`session_exercises`) freezes the **resolved** muscle
  groups at session start, preserving today's "history is immutable" behavior.
- **web** — the add-exercise flow leads with an **exercise picker** (searchable list
  from the catalog); picking an entry fills name + muscle metadata and default
  measurement type, leaving the user to set targets. A **"Custom exercise"** option
  falls back to the current free-text form.
- **Tests** — unit + e2e per [`.claude/rules/testing.md`](../.claude/rules/testing.md).

**Out of scope:**

- **User-owned catalogs** (users saving their own reusable entries). Custom exercises
  stay routine-local; promoting them into shared master data is a later PRD.
- **Admin UI to edit the catalog.** The catalog is curated via seed/migration for now.
- **Equipment, difficulty, instructions, images, or per-exercise media** on catalog
  entries — the schema leaves room but this PRD ships only name + muscle metadata +
  default measurement type.
- **Backfilling / relinking existing routine exercises** to catalog entries. Existing
  rows keep working unchanged as custom exercises; linking is opt-in going forward.
- **New muscle-group vocabulary.** We reuse the existing `muscle_group` enum as-is.

## 4. Design

### 4.1 Data model

**New table `exercise_catalog` (global, not user-scoped):**

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | |
| `name` | `TEXT NOT NULL UNIQUE` | canonical movement name |
| `primary_muscle_group` | `muscle_group NOT NULL` | reuses existing enum |
| `secondary_muscle_groups` | `muscle_group[] NOT NULL DEFAULT '{}'` | |
| `default_measurement_type` | `TEXT NOT NULL DEFAULT 'weight_reps'` | pre-fills the form; validated against `vocab` |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | |

Global (shared by all users) and **read-only** to users — there is no create/update/
delete endpoint for catalog rows in this PRD. Seeded by the migration.

**`exercises` gains a link column:**

- `catalog_exercise_id UUID NULL REFERENCES exercise_catalog(id) ON DELETE SET NULL`.
- `primary_muscle_group` becomes **nullable**, with a table `CHECK` enforcing that a
  resolvable muscle group always exists:
  `CHECK (catalog_exercise_id IS NOT NULL OR primary_muscle_group IS NOT NULL)`.
  - **Catalog-linked** exercise: `catalog_exercise_id` set; own muscle columns left
    `NULL` (source of truth is the catalog).
  - **Custom** exercise: `catalog_exercise_id NULL`; own muscle columns populated
    (exactly today's behavior).

> **Reference-only, deliberately.** Editing a catalog entry's muscle groups later
> updates every linked routine exercise's *displayed* metadata — the intended behavior
> of the "Reference only" decision. Immutable *history* is still guaranteed separately
> by the session snapshot (§4.4), which copies resolved values at session start.

### 4.2 Resolve-on-read (API)

The API response shape for an exercise is **unchanged** — it always returns concrete
`primary_muscle_group` and `secondary_muscle_groups`, plus new fields
`catalog_exercise_id` and (for convenience) `catalog_name`. Resolution rule when
reading an exercise:

```
if catalog_exercise_id is set:
    primary_muscle_group   = catalog.primary_muscle_group
    secondary_muscle_groups = catalog.secondary_muscle_groups
else:
    primary_muscle_group   = exercises.primary_muscle_group   (custom)
    secondary_muscle_groups = exercises.secondary_muscle_groups
```

Implemented as a `LEFT JOIN exercise_catalog` in `ExerciseRepository.ListByRoutine`
and the single-exercise reads, resolving in SQL (`COALESCE`) so the web app needs no
change to how it renders muscle-group badges (`muscleGroupLabel`).

### 4.3 Create / update contract (API)

`exerciseRequest` (handler `exercise.go`) gains an optional `catalog_exercise_id`.

- **Create with `catalog_exercise_id`:** service validates the catalog row exists;
  stores the link; **ignores** any muscle-group fields in the request (they come from
  the catalog). `name` defaults to the catalog name if the request omits it, but a
  caller-supplied `name` is still allowed (a routine line may label it, e.g.
  "Bench Press (paused)"). `measurement_type` defaults to the catalog's
  `default_measurement_type` when omitted.
- **Create without `catalog_exercise_id` (custom):** unchanged — `name` required,
  `primary_muscle_group` required, validated against `vocab` as today.
- **Update:** may set or clear `catalog_exercise_id`. Clearing it (unlink) requires the
  request to also supply a `primary_muscle_group` so the `CHECK` holds; the service
  enforces this and returns `400` otherwise.

Validation lives in `service/exercise_service.go` alongside the existing
`validateExercise` checks.

### 4.4 Session snapshot stays immutable

When a session starts, `session_exercises` already snapshots
`primary_muscle_group` / `secondary_muscle_groups` from the exercise. That snapshot now
copies the **resolved** values (catalog-resolved for linked exercises, own columns for
custom). Past sessions therefore never change even if the catalog is later edited —
consistent with PRD 0002's snapshot design.

### 4.5 Web — pick, don't type

The add-exercise entry point (the `+` action on `RoutineDetailPage`) changes from
"open a blank form in a sheet" to:

1. **Exercise picker sheet** — a searchable list of catalog entries
   (`GET /exercise-catalog`, client `catalogApi.list`), grouped/filterable by muscle
   group, each row showing the name + a primary-muscle badge. Native-mobile per
   [`.claude/rules/native-mobile-ux.md`](../.claude/rules/native-mobile-ux.md): full
   sheet, search field, ≥44px rows, no desktop popovers.
2. **Pick → targets sheet** — selecting an entry advances to a compact form pre-filled
   with the catalog's name, muscle groups (shown read-only as badges), and default
   measurement type; the user fills **only** targets (sets/reps/weight/…). Submit →
   `exercisesApi.create({ catalog_exercise_id, ...targets })`.
3. **"Custom exercise"** row at the top/bottom of the picker → the existing
   `ExerciseFormFields` free-text form (name + muscle-group select + targets),
   preserving current behavior and e2e selectors.

Editing an exercise (exercise detail page, PRD 0004) shows the resolved metadata; a
catalog-linked exercise renders its muscle groups read-only with an "unlink / make
custom" affordance, while a custom exercise keeps the editable muscle-group select.

New web pieces: `catalogApi` in `src/api/`, a `useExerciseCatalog` query hook, and an
`ExercisePickerSheet` under `src/features/exercises/`. The `MuscleGroup` types and
`muscleGroupLabel` helper are reused unchanged.

## 5. Testing

Per [`.claude/rules/testing.md`](../.claude/rules/testing.md), ships with unit **and**
e2e tests under the root `tests/` tree.

**API**

- **Unit** (`tests/unit-test/api/`): catalog validation (bad `muscle_group` /
  `measurement_type` rejected); create-with-`catalog_exercise_id` ignores request
  muscle fields; unlink without a `primary_muscle_group` returns `400`; resolve-on-read
  returns catalog muscle groups for linked and own columns for custom.
- **E2E** (`tests/e2e/api/`, embedded Postgres per the testing rule): `GET
  /exercise-catalog` returns the seed and honors `?search=`/`?muscle_group=`; create a
  routine → add a catalog-linked exercise (targets only) → read the routine back and
  assert the resolved muscle groups match the catalog; add a custom exercise and assert
  its own muscle groups persist; start a session and assert the snapshot froze the
  resolved values.

**Web**

- **Unit** (`tests/unit-test/web/`): picker lists/filters/searches catalog entries; the
  targets sheet posts `catalog_exercise_id` + targets and no muscle fields; the "custom
  exercise" path still renders the free-text form.
- **E2E** (`tests/e2e/web/`): open a routine → `+` → pick "Bench Press" from the catalog
  → set targets → save → the exercise appears with a `chest` badge; then add a custom
  exercise via the escape hatch and assert it saves with the chosen muscle group.

A new test must fail without the change and pass with it; tests run on dedicated ports
per the testing rule (never local `:5173`/`:8080`/`:5432`).

## 6. Rollout

- **PR 1 — `[migration]`**: create `exercise_catalog`, seed the focused set, add
  `catalog_exercise_id` to `exercises`, make `primary_muscle_group` nullable + `CHECK`.
- **PR 2 — `[api][feat]`**: `GET /exercise-catalog` (+ filters), create/update contract
  changes, resolve-on-read, snapshot resolution, tests.
- **PR 3 — `[web][feat]`**: exercise picker + targets sheet + custom escape hatch,
  `catalogApi`/hook, edit-page handling, tests.

No feature flag: the picker is additive and the custom path preserves today's flow;
existing exercises remain valid custom rows (their `primary_muscle_group` stays set,
`catalog_exercise_id` NULL). The migration is backward-compatible — nullable column +
a `CHECK` that all existing (non-null) rows already satisfy.

## 7. Open questions

1. **Catalog seed contents** — the exact ~40–60 movements and their secondary-muscle
   tagging need a curated list to review (proposed to live in the seed migration).
2. **Custom-name on a linked exercise** — do we allow a per-routine label distinct from
   the catalog name (§4.3), or force the catalog name for linked exercises? Current
   proposal: allow an optional override; default to the catalog name.
3. **Filtering UX** — group the picker by muscle group vs. a flat searchable list with a
   muscle-group filter chip row. Proposed: flat list + search + optional filter chips.
