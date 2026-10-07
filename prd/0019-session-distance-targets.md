# PRD 0019 — Distance Targets for Session Ad-Hoc Exercises

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Draft |
| Created | 2026-10-07 |
| Updated | 2026-10-07 |
| App | api, web |
| Extends | [0002 Session Lifecycle](0002-session-lifecycle-and-metrics.md), [0017 Session-Scoped Catalog Exercise](0017-session-scoped-catalog-exercise.md) |

## 1. Problem

The "Distance" measurement type is a first-class citizen everywhere **except**
when adding an exercise mid-session. A user who adds a distance exercise (e.g. a
run, a row) to a live session through the catalog picker
(`apps/web/src/features/exercises/ExercisePickerSheet.tsx`, session mode) is
shown **Sets / Reps** inputs instead of a distance value + unit — because the
ad-hoc add path has no way to store a distance target.

### Root cause

Distance targets are supported end-to-end for **routine** exercises — the
`exercises` table has `target_distance NUMERIC(9,3)` + `distance_unit` columns,
and the handler/service/repo all carry them. The **session** ad-hoc path has no
equivalent:

- The `session_exercises` table
  (`apps/api/migrations/0001_initial_schema.sql`) has `target_sets`,
  `target_reps`, `target_weight`, `target_duration_seconds` — but **no**
  `target_distance` / `distance_unit` columns.
- The ad-hoc request/repo input carry no distance fields:
  `adHocExerciseRequest` (`apps/api/internal/handler/session.go`) and
  `AdHocExerciseInput` (`apps/api/internal/repository/session_exercise_repo.go`)
  stop at `target_duration_seconds`; the `INSERT` into `session_exercises`
  (`AddAdHocExercise`) never writes distance columns.
- The web `AdHocExerciseInput` (`apps/web/src/api/sessions.ts`) and the picker's
  `toAdHocInput` mapper carry no distance fields either.

Because a session distance **target** cannot be persisted, the web fix shipped
alongside this PRD deliberately keeps the session picker on Sets/Reps for a
distance exercise rather than showing a distance input whose value the API would
silently drop. This PRD closes that gap.

> Note: distance **logging** during a session already works — `set_entries` has
> `distance` + `distance_unit` columns and the set-logging path uses them. The
> gap is strictly the per-exercise **target** ("to beat") hint on the session
> checklist item.

### Concrete scenario

Mid-session the user adds **Outdoor Run** (a distance catalog exercise) to the
current workout and wants to set a target of **5 km**. Today the picker shows
"Sets" and "Reps"; there is nowhere to enter 5 km. They expect a distance value
+ unit (km / mi / m), and to see "5km" as the target on the checklist row — the
same experience they get when adding a distance exercise to a routine.

## 2. Goals

- A distance exercise added to a live session accepts a **target distance +
  unit** (km / mi / m), not sets/reps.
- The target distance round-trips: it is stored on the session exercise and
  shown on the session checklist row (`ExerciseCard`) as e.g. "5km".
- The catalog picker in **session** mode renders the same distance field already
  used in **routine** mode — removing the current `target.kind`-based gate.
- Parity with the routine path: the distance default is **km**, matching the
  routine form (`DEFAULT_DISTANCE_UNIT`).

### Non-goals

- Changing how distance is **logged** per set (already works via `set_entries`).
- Progressive-overload trend/analytics for distance (out of scope; may be a
  later PRD).
- Any change to the already-shipped routine distance form.

## 3. Design

### 3.1 Schema (migration)

Add distance target columns to `session_exercises`, mirroring the `exercises`
table so the snapshot shape stays symmetric:

```sql
-- migrations/00NN_session_exercise_distance_target.sql
ALTER TABLE session_exercises
  ADD COLUMN target_distance NUMERIC(9,3),
  ADD COLUMN distance_unit   distance_unit;
```

(`distance_unit` enum already exists from `0001`.) Nullable, no backfill — all
existing rows keep `NULL`, consistent with how non-distance exercises already
leave the other target columns `NULL`.

### 3.2 API

- `adHocExerciseRequest` + `repository.AdHocExerciseInput`: add
  `TargetDistance *float64` (`target_distance`) and `DistanceUnit *string`
  (`distance_unit`).
- `AddAdHocExercise` `INSERT` writes the two new columns (parameterized).
- `validateAdHoc` (`session_service.go`): reject an unknown `distance_unit` via
  `vocab.IsDistanceUnit`, matching `validateExercise`.
- `sessionExerciseSelect` + `scanSessionExercise` + `domain.SessionExercise`:
  surface `target_distance` / `distance_unit` on reads so the checklist row can
  render the target.

### 3.3 Web

- `AdHocExerciseInput` (`apps/web/src/api/sessions.ts`): add `target_distance?`
  and `distance_unit?`.
- `toAdHocInput` (`ExercisePickerSheet.tsx`): pass the distance fields through.
- Remove the `target.kind === 'routine'` gate on `isDistance` in
  `ExercisePickerSheet` so the distance field shows in session mode too.
- `SessionExercise` type (`apps/web/src/types/api.ts`): add `target_distance` /
  `distance_unit`.
- `ExerciseCard` (`apps/web/src/features/sessions/ExerciseCard.tsx`): pass the
  distance fields into `formatTarget` (already distance-aware) so the row shows
  e.g. "Target 5km".

## 4. Testing

Per `.claude/rules/testing.md`, ship a unit test **and** an e2e test:

- **API unit** (`tests/unit-test/api/`): `AddAdHocExercise` persists and returns
  `target_distance` / `distance_unit`; an invalid unit is rejected.
- **Web unit** (`tests/unit-test/web/`): the session picker shows the distance
  field for a distance exercise and `toAdHocInput` posts `target_distance` /
  `distance_unit` (invert the guard added in the routine-fix PR).
- **E2E** (`tests/e2e/web/`): start a session → add a distance catalog exercise
  → set 5 km → the checklist row shows "5km" and it survives a reload.

## 5. Rollout

- Pure additive migration (nullable columns) — safe to deploy ahead of the API.
- No data backfill. Existing session exercises are unaffected.
- Ship migration → API → web in order; the web distance field in session mode
  only lights up once the API accepts the fields.
