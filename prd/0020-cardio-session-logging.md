# PRD 0020 — Cardio Session Logging (distance target + distance/duration/pace/HR inputs)

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Approved |
| Created | 2026-10-08 |
| Updated | 2026-10-08 |
| App | api / web |
| Supersedes | [0019 Distance Targets for Session Ad-Hoc Exercises](0019-session-distance-targets.md) |
| Related PRDs | [0002](0002-session-lifecycle-and-metrics.md), [0006](0006-exercise-catalog.md), [0015](0015-cardio-toggle-and-session-history-detail.md), [0017](0017-session-scoped-catalog-exercise.md) |

> **Supersedes [PRD 0019](0019-session-distance-targets.md).** PRD 0019 planned
> distance targets for session ad-hoc exercises and shipped the routine-side form,
> deferring the `session_exercises` distance columns to a follow-up. This PRD
> delivers that follow-up and extends it to full in-session cardio logging
> (distance, duration, derived pace, average/max heart rate, incline).

## 1. Problem

The `distance` measurement type exists end-to-end in the *template* layer — the
`measurement_type` enum, the `exercises` table (`target_distance` /
`distance_unit`), the exercise catalog (running/cardio movements seeded as
`distance`), and the detail-view `describeTarget` all support it. But the
**session** layer never implemented `distance`, so a cardio exercise is broken
the moment it enters a workout:

1. **The distance target is dropped.** `session_exercises` has `target_sets`,
   `target_reps`, `target_weight`, `target_duration_seconds` — but **no
   `target_distance` / `distance_unit` column**. When a session is started from
   a routine, the snapshot copies the other targets and silently drops
   `exercises.target_distance`. So a "5 km" target set on the routine exercise
   shows as **"Target —"** in the session.

2. **The logging inputs are wrong.** `ExerciseCard` only special-cases
   `measurement_type === 'duration'`; `distance` falls through to the weight/reps
   branch, so a run shows a **kg/lb toggle and "kg" / "reps" inputs** instead of
   distance. `formatTarget` has no distance case either (→ "—").

3. **Cardio results can't be captured.** The web `EntryInput` has no `distance`
   field, and there is **no place at all to store heart rate** — `set_entries`
   has `distance`, `distance_unit`, `duration_seconds`, `incline`, `speed` but
   no HR columns. A runner can't record the things that actually define the bout:
   distance, duration, pace, and heart rate.

The reported symptom (a "Jogging / 5 KM" exercise showing "Target —" with kg/reps
inputs) is produced by #1 and #2; #3 is what the user asked for next: *"for the
specific running exercise we should be able to input the distance, duration, pace
and average HR when doing the session."*

## 2. Goals

1. **Carry the distance target through the session layer** so a `distance`
   exercise shows its target (e.g. **"5 km"**) on the active-session checklist,
   both for routine-started sessions (snapshot) and ad-hoc catalog picks.
2. **Metric-aware set logging for cardio.** For a `distance` exercise, log a bout
   with **distance (+ unit), duration, average HR, max HR, and incline**, and
   show **pace** derived live from distance ÷ duration. For a `duration`
   exercise, log **duration + average HR + max HR + incline**. Strength
   (`weight_reps` / `reps_only`) is unchanged.
3. **Fix the in-session picker** so picking a `distance` catalog movement offers
   a **distance target** input (not Sets/Reps).

## 3. Non-goals

- **Pace is derived, never stored** — it is `duration ÷ distance`, computed and
  displayed client-side (consistent with the repo rule "progressive overload is
  derived, never stored"). No pace column, no manual pace field.
- **No cardio trend/analytics** in this PRD (no total-distance aggregate on
  completion, no pace-over-time chart). Per-bout values are recorded and shown on
  the session; dashboards come later.
- **No distance unit *preference*.** Logging defaults the distance unit to the
  exercise's target unit (else `km`) with an inline km/mi toggle, mirroring the
  existing kg/lb toggle — but no persisted user setting.
- **No new muscle semantics.** Cardio identification (PRD 0015) is unchanged.

## 4. Design

### 4.1 Schema — migration `0008_cardio_session_logging.sql`

- `ALTER TABLE session_exercises ADD COLUMN target_distance NUMERIC(9,3)`,
  `ADD COLUMN distance_unit distance_unit` — mirrors the `exercises` columns so
  the snapshot and ad-hoc paths can carry a distance target.
- `ALTER TABLE set_entries ADD COLUMN avg_heart_rate INTEGER`,
  `ADD COLUMN max_heart_rate INTEGER` — HR is new; `distance`, `duration_seconds`,
  and `incline` already exist on `set_entries`.

All additive and nullable; no backfill.

### 4.2 API

- **`domain.SessionExercise`** gains `TargetDistance *float64` + `DistanceUnit
  *string`; **`domain.SetEntry`** gains `AvgHeartRate *int` + `MaxHeartRate *int`.
- **`session_exercise_repo.go`** — add `target_distance, distance_unit` to
  `sessionExerciseSelect`, `sessionExerciseReturning`, both Scan calls, and the
  `AddAdHocExercise` INSERT; add the two fields to `AdHocExerciseInput`.
- **`session_repo.go`** — the start-session snapshot INSERT…SELECT copies
  `e.target_distance, e.distance_unit`.
- **`entry_repo.go`** — add `avg_heart_rate, max_heart_rate` to `entrySelect`,
  `scanEntry`, the `CreateEntry` INSERT, the `UpdateEntry` SET + RETURNING, and
  `ListEntriesForSession`; add the two fields to `SetEntryInput`.
- **`handler/session.go`** — `adHocExerciseRequest` gains `target_distance` /
  `distance_unit`; `entryRequest` gains `avg_heart_rate` / `max_heart_rate` and
  maps them in `toInput()`.
- **`service/session_service.go`** — `validateAdHoc` validates `distance_unit`
  and non-negative `target_distance`; `validateEntry` validates non-negative
  `distance`, `avg_heart_rate`, `max_heart_rate`, `incline`.

The set-entry endpoint already accepts `distance` / `distance_unit` / `incline`;
only HR is new on the request.

### 4.3 Web

- **Types** (`types/api.ts`): `SessionExercise` gains `target_distance` /
  `distance_unit`; `SetEntry` gains `avg_heart_rate` / `max_heart_rate`.
- **`api/sessions.ts`**: `EntryInput` gains `distance`, `distance_unit`,
  `incline`, `avg_heart_rate`, `max_heart_rate`; `AdHocExerciseInput` gains
  `target_distance` / `distance_unit`.
- **`lib/format.ts`**: `formatTarget` gains a `distance` case
  (`${target_distance}${distance_unit}`); new `formatPace(distance, unit,
  seconds)` → `"5:30 /km"`; reuse `formatDuration`.
- **`features/sessions/ExerciseCard.tsx`**: branch on
  `measurement_type`. A new `isDistance` / `isCardio` path renders, for a
  distance bout: a distance input + km/mi toggle, a duration (minutes) input, a
  live **pace** readout, and optional avg HR / max HR / incline inputs; logs via
  `EntryInput`. The existing `duration` path additionally gains optional HR /
  incline inputs. `EntryRow` renders a logged cardio bout
  (`"5 km · 27:30 · 5:30 /km · ♥ 150"`) and edits it.
- **`features/exercises/ExercisePickerSheet.tsx`** + `ExerciseForm` helpers: a
  `distance` type shows a **Target distance** (+ unit) input, carried into the
  ad-hoc payload.

### 4.4 Minimum-to-log & defaults

- Distance bout: **distance is required** (> 0); duration optional; pace shows
  only when both are present. HR / incline optional.
- Duration bout: **minutes required** (unchanged); HR / incline optional.
- Distance unit defaults to the exercise's `distance_unit` (else `km`).

## 5. Testing

Per `.claude/rules/testing.md` — unit **and** e2e.

- **Go unit** (`tests/unit-test/api/`): `validateEntry` rejects negative HR /
  distance; the routine→session snapshot copies `target_distance` /
  `distance_unit`.
- **Go e2e** (`tests/e2e/`): create a routine exercise with
  `measurement_type=distance`, `target_distance=5`, `distance_unit=km` → start a
  session → `GET /sessions/:id` returns the session exercise with
  `target_distance=5`; log an entry with distance + duration + avg/max HR +
  incline → read it back with every field intact.
- **Web unit** (`tests/unit-test/web/`): `formatTarget` distance case +
  `formatPace`; `ExerciseCard` renders distance inputs (not kg/reps) for a
  `distance` exercise, shows the target and derived pace, and logs the cardio
  payload.
- **Web e2e** (`tests/e2e/web/`): extend a session flow so a distance exercise
  shows its target and a logged run round-trips.

`lint`, `typecheck`/`vet`, and `build` for both apps must pass.

## 6. Rollout

Additive. One migration (two tables, four nullable columns), API field additions
(no endpoint/contract removals), and web rendering. No feature flag, no config,
no backfill. Existing strength/duration logging is unchanged.
