# PRD 0021 — Muscle Groups on the Workout-Day Detail (Before Start)

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Approved |
| Created | 2026-10-19 |
| Updated | 2026-10-19 |
| App | web |

## Problem

A completed session's summary already shows which muscle groups were worked
(PRD 0013/0015), but there is no way to see what a workout day trains *before*
you start it. On the workout-day detail page (`/routines/:id`) each exercise
shows its own primary-muscle badge, yet nothing aggregates them, so a user
scanning their workout days ("which one is a back day again?") has to read every
exercise row and do the aggregation in their head.

The user wants to glance at a workout day — while it is *not started yet* — and
immediately see the set of muscle groups it will affect, so they can compare
what each of their workout days trains.

## Goals

- On the workout-day detail page (`/routines/:id`), show an aggregated
  **"Muscles worked"** row — the distinct muscle groups the day's exercises will
  hit — visible before the session is started.
- Reuse the existing muscle-group data already on each exercise
  (`primary_muscle_group` + `secondary_muscle_groups`) and the existing badge
  styling used by the completed summary, so the surfaces stay visually
  consistent.
- Treat cardio consistently with the rest of the app: a cardio/running movement
  is timed work, not lifting, so it does not contribute to "muscles worked" — a
  pure running day shows no row (hence "not a running session").

## Non-goals

- **No API or schema change.** The data is already present on the routine
  payload per exercise; this is a web-only display change.
- Not adding a body heatmap here — just the labelled badges. (The richer
  `MuscleUsageDiagram` stays on the post-session summary, which is set-weighted;
  a not-yet-started day has no sets to weight by.)
- Not changing the in-progress session view (`/sessions/:id`) in this PRD.

## Design

### Data

A workout day's exercises (`routine.exercises`) each carry
`primary_muscle_group` and `secondary_muscle_groups` (resolved from the catalog
for linked exercises, PRD 0006). No new fields are needed.

A new pure helper, `affectedMuscleGroups(exercises, { includeCardio })`, in
`apps/web/src/lib/sessionMuscles.ts`, returns the distinct muscle groups across
the exercises (each exercise's primary group plus every secondary group):

- **Cardio excluded by default** — mirrors `sessionMuscleUsage(..., {
  includeCardio: false })`: a cardio exercise (`primary_muscle_group ===
  'cardio'`) is skipped entirely, dropping its secondary credit too, using the
  same `isCardioExercise` rule.
- **Canonical order** — results come back ordered by the shared `MUSCLE_GROUPS`
  body-area order (chest → back → … → core), so the badges read the same across
  every workout day regardless of exercise order.

The helper is generic over the minimal `{ primary_muscle_group,
secondary_muscle_groups }` shape, so it works for both routine `Exercise` and
`SessionExercise`.

### UI

On `RoutineDetailPage`, between the header actions and the exercise list, render
a grouped card:

```
Muscles worked
[Chest] [Shoulders] [Triceps] [Core]
```

- Reuses the existing `.card`/`.section-label`/`.row.wrap` layout and the
  `badge badge-active` style from the completed `SessionSummary`.
- The card is **only rendered when there is at least one muscle group** — so an
  empty routine, or a pure cardio/running day, shows nothing (no empty "—"
  placeholder), matching the "not a running session" intent.
- Mobile-first: badges wrap within the single-column card; no new tokens or
  layout primitives are introduced (native-mobile-ux rule).

## Rollout

Single web change, no migration, no API change, backward compatible (purely
additive display). Ships with unit tests (the `affectedMuscleGroups` helper +
the `RoutineDetailPage` rendering) and an e2e test (the badges appear on the
workout-day detail before starting a session).

## Testing

- **Unit** (`tests/unit-test/web/`):
  - `sessionMuscles.test.ts` — `affectedMuscleGroups` dedupes primary +
    secondary groups, returns canonical order, excludes cardio by default, keeps
    cardio when `includeCardio` is true, and is empty for no exercises.
  - `RoutineDetailPage.test.tsx` — the "Muscles worked" badges render from the
    routine's exercises, and the section is hidden for a cardio-only day.
- **E2E** (`tests/e2e/web/`): create a workout day, add exercises, and assert the
  aggregated "Muscles worked" badges show on the detail page **before** starting.
