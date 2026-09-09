# PRD 0002 — Session Lifecycle, Exercise Types & Metrics

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Draft |
| Created | 2026-09-09 |
| Updated | 2026-09-09 |
| App | api, web |
| Extends | [PRD 0001 — Workout Tracking Foundation](0001-workout-tracking-foundation.md) |

## 1. Summary

This PRD extends the [Phase 1 foundation](0001-workout-tracking-foundation.md)
with a **real workout-session experience** and a **metrics-first data model** so a
monitoring dashboard is trivial to build later.

It adds three things:

1. **A session lifecycle** — **Start / Pause / Resume / Stop** controls that
   track true workout **duration** (active time excluding pauses) and the
   **muscle groups** trained that day.
2. **A live exercise checklist** — once a session starts, its exercises render as
   **todo items** the user ticks off as each is completed.
3. **Duration-based exercises** — an exercise can be measured by **time**
   (e.g. "Incline Walk — 30 minutes"), not only sets × reps, and a session can
   include ad-hoc exercises added on the spot.

Throughout, we **capture as much structured metadata as possible now**
(durations, timestamps, muscle groups, per-set metrics, completion state) even
though the dashboard itself is a later phase. The dashboard is explicitly **out
of scope here** — the goal is that when we build it, every metric it needs is
already stored.

## 2. Motivation

PRD 0001 lets a user define routines and log sets, but a real gym session is a
*stateful activity*: you start it, you rest/pause, you work through a list, and
you finish with a record of "what I did today and how long it took." And not
every movement is sets × reps — incline walks, planks, and stretches are timed.

If we don't capture session timing, per-exercise completion, muscle groups, and
typed per-set metrics **from day one**, a future dashboard ("weekly training
minutes", "sets per muscle group", "consistency streak", "time under tension")
becomes a painful backfill. Storing the metadata up front is cheap; reconstructing
it later is not.

## 3. Goals

- Start, pause, resume, and stop a workout session; persist an accurate
  **active duration** (excluding paused time) and total elapsed time.
- On session start, snapshot the routine's exercises into a **checklist** the
  user checks off (pending → in progress → done / skipped).
- Support exercises measured by **duration** (and keep sets × reps), plus enough
  shape to add distance/incline/speed later without a schema rewrite.
- Record the **muscle group(s)** each exercise trains, and aggregate a session's
  worked muscle groups.
- Add exercises to a session **ad hoc** (not previously in the routine).
- Store a complete, typed **metrics footprint** per set, per exercise, and per
  session, plus a JSONB escape hatch for future fields — so the dashboard is a
  read-only projection later.

## 4. Non-Goals (this phase)

- **The dashboard / analytics UI itself.** We store the data; we do not build the
  charts, aggregates endpoints, or reports yet (a later PRD).
- Rest timers with notifications, auto-pause on inactivity, wearable/HR
  integration, GPS for outdoor cardio.
- RPE/RIR-driven programming, 1RM formulas, auto-progression suggestions.
- Supersets/circuits as first-class groupings (a metadata hook is noted, not
  built).
- Social sharing, exports.

## 5. New & Changed Concepts

PRD 0001 defined `User`, `Routine`, `Exercise`, `WorkoutSession`, `SetLog`. This
PRD **revises `Exercise`, `WorkoutSession`, and `SetLog`** and **adds three
entities**: `SessionExercise`, `SessionEvent`, and a `MuscleGroup` vocabulary.

```
Routine ──< Exercise            (definitions/templates)
   │            │
   │ start()    │ snapshot at session start
   ▼            ▼
WorkoutSession ──< SessionExercise ──< SetEntry     (what actually happened)
   │                    │
   └──< SessionEvent    └── (checklist item + per-exercise aggregates)
        (start/pause/resume/stop timeline)
```

### 5.1 `Exercise` (revised — definition/template)

Gains a **measurement type** and **muscle targeting**:

| Field | Type | Notes |
|-------|------|-------|
| `measurement_type` | enum | `weight_reps`, `reps_only`, `duration`, `distance` (extensible). Drives which targets/metrics apply. |
| `target_sets` | int, nullable | for `weight_reps` / `reps_only`. |
| `target_reps` | int, nullable | for `weight_reps` / `reps_only`. |
| `target_weight` | numeric, nullable | optional prescribed weight. |
| `target_duration_seconds` | int, nullable | for `duration` (e.g. 1800 = 30 min). |
| `target_distance` / `distance_unit` | numeric / enum, nullable | for `distance` (future-friendly). |
| `primary_muscle_group` | enum (FK to vocabulary) | e.g. `chest`, `back`, `quads`, `cardio`. |
| `secondary_muscle_groups` | enum[] | optional assisting groups. |
| `default_metadata` | JSONB | e.g. `{ "incline": 6, "speed": 5.5 }` for an incline walk. |

Example: **Incline Walk** → `measurement_type: duration`,
`target_duration_seconds: 1800`, `primary_muscle_group: cardio`,
`default_metadata: { incline: 6, speed: 5.5 }`.

### 5.2 `WorkoutSession` (revised — a stateful activity)

| Field | Type | Notes |
|-------|------|-------|
| `status` | enum | `active`, `paused`, `completed`, `abandoned`. |
| `started_at` | timestamp, nullable | set on first Start. |
| `ended_at` | timestamp, nullable | set on Stop/complete. |
| `total_duration_seconds` | int, nullable | `ended_at − started_at` (wall clock). |
| `active_duration_seconds` | int, nullable | total minus paused time — the "real" workout time. |
| `paused_duration_seconds` | int, nullable | sum of pause intervals. |
| `muscle_groups` | enum[] | denormalized set of groups trained (from its exercises) for fast reads. |
| `notes` | text | free notes. |
| `metadata` | JSONB | future/extra fields (mood, bodyweight, location, …). |

Durations are **computed from `SessionEvent`s** (source of truth) and
**persisted on Stop** so dashboard reads never have to replay events.

### 5.3 `SessionEvent` (new — the lifecycle timeline)

An append-only log of lifecycle transitions. This is what makes duration accurate
and gives the dashboard a rich activity timeline.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | |
| `session_id` | UUID FK | |
| `type` | enum | `start`, `pause`, `resume`, `complete`, `abandon`. |
| `occurred_at` | timestamp | server-authoritative. |
| `metadata` | JSONB | optional (e.g. client-reported reason). |

`active_duration = Σ (resume/start → next pause/complete)` intervals;
`paused_duration = Σ (pause → resume)` intervals.

### 5.4 `SessionExercise` (new — the checklist item + snapshot)

When a session starts, each routine exercise is **snapshotted** into a
`SessionExercise`. This powers the todo checklist, preserves history if the
routine is later edited (resolving an open question from PRD 0001), and holds
per-exercise aggregates for the dashboard.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | |
| `session_id` | UUID FK | |
| `exercise_id` | UUID FK, nullable | source template (null if ad-hoc / template later deleted). |
| `position` | int | order in the checklist. |
| `name_snapshot` | text | name at session time. |
| `measurement_type` | enum | snapshotted. |
| `target_sets` / `target_reps` / `target_weight` | nullable | snapshotted targets. |
| `target_duration_seconds` | int, nullable | snapshotted. |
| `primary_muscle_group` / `secondary_muscle_groups` | enum / enum[] | snapshotted. |
| `status` | enum | `pending`, `in_progress`, `completed`, `skipped` — the checkbox state. |
| `completed_at` | timestamp, nullable | when ticked done. |
| **Derived aggregates** (persisted on completion): | | |
| `sets_completed` | int | count of logged entries. |
| `total_reps` | int, nullable | Σ reps. |
| `total_volume` | numeric, nullable | Σ weight × reps. |
| `total_duration_seconds` | int, nullable | Σ entry durations (for timed work). |
| `top_set_weight` | numeric, nullable | max weight. |
| `metadata` | JSONB | e.g. superset group id, felt-easy flag. |

### 5.5 `SetEntry` (revised from `SetLog` — a generic performed unit)

Generalized so one row can represent a strength set **or** a timed/distance bout.
Type-specific columns are nullable; `measurement_type` (via the parent
`SessionExercise`) says which apply.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | |
| `session_exercise_id` | UUID FK | links to the checklist item (and thus session + exercise). |
| `entry_number` | int | 1-based order (the "set number"). |
| `weight` / `weight_unit` | numeric / enum, nullable | `kg` \| `lb`. |
| `reps` | int, nullable | |
| `duration_seconds` | int, nullable | for timed work (incline walk, plank). |
| `distance` / `distance_unit` | numeric / enum, nullable | future cardio. |
| `incline` | numeric, nullable | common cardio metric. |
| `speed` | numeric, nullable | common cardio metric. |
| `rpe` | numeric, nullable | optional effort (reserved; not surfaced in UI this phase). |
| `is_completed` | bool | supports checkbox-per-set if desired. |
| `performed_at` | timestamp | enables rest-time-between-sets derivation. |
| `metadata` | JSONB | anything else (band, tempo, notes). |

> **Rest time** between sets is intentionally **not stored** as its own column —
> it is derivable from consecutive `performed_at` values, and we avoid
> denormalizing something we can compute. The dashboard can surface it later.

### 5.6 `MuscleGroup` vocabulary (new)

A controlled vocabulary (enum or small reference/seed table) so muscle-group
metrics aggregate cleanly on the dashboard instead of fighting free-text typos.

Proposed initial set: `chest`, `back`, `shoulders`, `biceps`, `triceps`,
`forearms`, `quads`, `hamstrings`, `glutes`, `calves`, `core`, `full_body`,
`cardio`, `other`.

## 6. Metrics Footprint (dashboard-readiness checklist)

The dashboard is a later phase, but **all of the following are stored now** so it
is a pure read-model. Explicitly captured:

**Per session** — date, day-of-week (derivable from `started_at`), `status`,
`total`/`active`/`paused` duration, exercise count, completed-exercise count,
total sets, total volume, total timed-work seconds, `muscle_groups[]`, notes,
`metadata`.

**Per session-exercise** — completion `status`, `completed_at`, `sets_completed`,
`total_reps`, `total_volume`, `total_duration_seconds`, `top_set_weight`,
`primary`/`secondary` muscle groups.

**Per set-entry** — weight, unit, reps, duration, distance, incline, speed,
(reserved) rpe, `performed_at`, `metadata`.

**Derivable without extra storage** (documented so we don't denormalize): weekly
training minutes, sets/volume per muscle group over a window, consistency streak
(distinct session dates), rest time between sets, PRs per exercise (from
[PRD 0001's history endpoint](0001-workout-tracking-foundation.md#7-api-design)),
average session length.

**Principle:** typed columns for known, frequently-aggregated metrics (fast SQL);
a JSONB `metadata` column on sessions, session-exercises, and entries as the
forward-compatible escape hatch so new metrics don't require a migration.

## 7. API Changes

Additive to PRD 0001's `/api/v1` surface. All scoped to the authenticated user.

### Session lifecycle

| Method | Path | Purpose |
|--------|------|---------|
| `POST`  | `/api/v1/routines/{routineId}/sessions` | **Start**: create an `active` session, snapshot exercises into `SessionExercise`s, emit `start` event. |
| `POST`  | `/api/v1/sessions/{id}/pause` | Emit `pause`; status → `paused`. |
| `POST`  | `/api/v1/sessions/{id}/resume` | Emit `resume`; status → `active`. |
| `POST`  | `/api/v1/sessions/{id}/complete` | **Stop**: emit `complete`, compute & persist durations + aggregates + `muscle_groups`. |
| `POST`  | `/api/v1/sessions/{id}/abandon` | Discard-but-keep-record; status → `abandoned`. |
| `GET`   | `/api/v1/sessions/{id}` | Session with events, session-exercises (checklist), and aggregates. |
| `GET`   | `/api/v1/sessions` | List past sessions (paginated) with summary metrics. |

### Checklist & ad-hoc exercises

| Method | Path | Purpose |
|--------|------|---------|
| `PATCH`  | `/api/v1/session-exercises/{id}` | Update checkbox `status` (in_progress / completed / skipped), position. |
| `POST`   | `/api/v1/sessions/{id}/exercises` | Add an ad-hoc exercise (e.g. Incline Walk 30 min) to a live session. |
| `DELETE` | `/api/v1/session-exercises/{id}` | Remove an exercise from the session. |

### Set entries

| Method | Path | Purpose |
|--------|------|---------|
| `POST`   | `/api/v1/session-exercises/{id}/entries` | Log a set/bout (weight×reps **or** duration/distance). |
| `PATCH`  | `/api/v1/entries/{id}` | Edit an entry. |
| `DELETE` | `/api/v1/entries/{id}` | Delete an entry. |

> These **supersede** PRD 0001's `/sessions/{id}/sets` endpoints — set logging now
> hangs off `SessionExercise` (the checklist item) rather than the session
> directly, so every logged unit is tied to a specific exercise and its
> aggregates.

### Server-authoritative timing

Lifecycle timestamps (`occurred_at`, `started_at`, `ended_at`) are stamped by the
**server**, not the client, so durations can't be spoofed or skewed by device
clocks. The client shows a running timer for UX but the record of truth is the
event log.

## 8. Web UX (mobile-first)

- **Routine detail** gains a prominent **Start Workout** button.
- **Active session screen**:
  - A sticky header with a **running timer** and **Pause / Resume** + **Stop**
    controls (Stop asks for confirmation).
  - The exercises as a **checklist**: each row shows target (e.g. "4×8" or
    "30:00"), a check control, and expands to log sets/bouts. Ticking the last
    target set can suggest marking the exercise done.
  - **Weight×reps** rows log `weight`/`reps`; **duration** rows log a timer or a
    minutes/seconds field; last session's numbers shown inline as the target to
    beat.
  - **"Add exercise"** to insert an ad-hoc movement mid-session.
  - On **Stop**: a summary (duration, muscle groups worked, sets/volume, timed
    minutes) — the same shape a future dashboard card will use.

## 9. Migrations & Data

- New tables: `session_events`, `session_exercises`, and `set_entries`
  (generalizing 0001's `set_logs`); new columns on `exercises` and
  `workout_sessions`; a muscle-group vocabulary (enum or seed table).
- Because PRD 0001 is **not yet implemented**, these land as part of the initial
  schema rather than as alterations to shipped tables — the two PRDs together
  define the Phase 1 schema. Migrations use the `[migration]` commit scope.
- Indexes: `session_events(session_id, occurred_at)`,
  `session_exercises(session_id, position)`,
  `set_entries(session_exercise_id, entry_number)`, and
  `workout_sessions(user_id, started_at)` for time-window dashboard queries.

## 10. Testing & Verification

- **Duration correctness** is the highest-risk area: unit-test that
  `active_duration` excludes paused intervals across multiple pause/resume cycles,
  including edge cases (pause with no resume before stop, immediate stop).
- Integration test the full lifecycle: start → log weight set → log a duration
  bout → pause → resume → complete, then assert persisted aggregates and
  `muscle_groups`.
- E2E happy path: start a session, check off exercises (incl. one duration
  exercise + one ad-hoc), stop, and see the summary.
- Reproduce-first for any bug; verify write **and** read of the round-trip.

## 11. Rollout Plan

Extends PRD 0001's rollout; each a reviewable PR to `main`:

1. **This PRD** (docs). *(this change)*
2. Schema/migrations for the revised + new entities.
3. Session lifecycle endpoints (start/pause/resume/stop) + duration computation.
4. Session-exercise checklist + ad-hoc add + set-entry logging (weight & duration).
5. Muscle-group vocabulary wired into exercises + session aggregation.
6. Web active-session screen (timer, checklist, duration logging, summary).
7. E2E happy path.
8. *(Later PRD)* Dashboard read-model & analytics UI over the metrics stored here.

## 12. Success Metrics

- Recorded **active duration** matches wall-clock active time within ±2s across
  pause/resume cycles.
- A user can start a session, work a mixed strength + duration checklist, and stop
  with a correct summary — no data loss if the routine is edited afterward.
- Every metric in §6 is queryable directly from stored columns (no backfill)
  when the dashboard phase begins.

## 13. Open Questions

- **Muscle group: enum vs. seed table?** Enum is simplest; a seed table allows
  user-defined groups later. Leaning enum for Phase 1.
- **Auto-pause / idle timeout?** Deferred; manual pause only for now.
- **One active session at a time?** Proposed constraint: a user may have at most
  one `active`/`paused` session; starting another prompts to finish the first.
- **Superset/circuit grouping** — captured only via `metadata` for now; promote to
  a first-class concept if needed.
- **Duration-exercise "sets"** — is a timed exercise ever multiple bouts (e.g.
  3 × 1-min planks)? The `SetEntry` model already supports multiple entries per
  session-exercise, so yes, with no schema change.
