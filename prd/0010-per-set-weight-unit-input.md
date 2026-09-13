# PRD 0010 — Per-Set Weight-Unit Input on the Running Session

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Approved |
| Created | 2026-09-13 |
| Updated | 2026-09-13 |
| App | web |

## Problem

Gym machines and plates are not consistently labelled: some show **kg**, some
show **lb**, and some show only one of the two. When logging a set during a
running session, the user should be able to enter the weight in **whatever unit
the machine in front of them displays**, and have it stored faithfully in that
unit — rather than mentally converting to their profile's preferred unit every
time.

Today the running-session set-logging UI
([`ExerciseCard.tsx`](../apps/web/src/features/sessions/ExerciseCard.tsx)) has
**no unit control**: it submits `{ weight, reps }` with no `weight_unit`, and the
API silently defaults the stored unit to the user's `preferred_weight_unit`
([`session_service.go` `CreateEntry`](../apps/api/internal/service/session_service.go)).
So a user whose preference is `kg` cannot log a lb-only machine's number without
converting it by hand first — and the stored value is then wrong for that row.

## Background — what already exists

The storage and contract for units are **already in place** (shipped with
[PRD 0008](0008-user-profile-enrichment.md)); this PRD only adds the missing
*input* control on the session screen:

- `set_entries.weight_unit` is a per-row `weight_unit` enum (`'kg' | 'lb'`),
  nullable — each logged set already stores its own faithful unit.
- The API already **accepts** `weight_unit` on entry create/update
  (`entryRequest` DTO, validated against `vocab.IsWeightUnit`, inserted by
  `entry_repo.go`). No API change is required.
- The web client already types it: `EntryInput.weight_unit?: WeightUnit | null`
  ([`api/sessions.ts`](../apps/web/src/api/sessions.ts)).
- Logged set rows already **render each entry's own stored unit**
  (`ExerciseCard.tsx` renders `${e.weight}${e.weight_unit}`).
- `User.preferred_weight_unit` (default `kg`) already exists and is the sensible
  default for the input control.

## Goals

1. Let the user choose **kg or lb per exercise** when logging sets on the running
   session, so the weight is stored with the unit actually shown on the machine.
2. Default the chosen unit to the user's `preferred_weight_unit` so the common
   case is zero extra taps.
3. Make the choice **sticky per exercise for the session** — set it once for a
   machine, and it stays for that exercise's remaining sets without re-toggling.
4. Persist the chosen unit faithfully on each logged set (`weight_unit`), and
   keep showing each set row in the unit it was logged in.

## Non-goals (deliberately out of scope)

Scope is **input-only**, per product decision. This PRD does **not** touch the
other display sites that currently hardcode `kg` or don't apply the preferred
unit — those stay exactly as they are today and are left for a future PRD:

- Session summary total volume / top-set weight (`SessionSummary.tsx`).
- Exercise-history trend-change label (`ExerciseHistoryPage.tsx`).
- Routine detail "last set" (`RoutineDetailPage.tsx`).
- Target-weight label (`lib/format.ts` `describeTarget`).
- Analytics dashboard volume unit and mixed-unit volume aggregation
  (`apps/api/pkg/analytics`). Aggregates (`session_exercises.total_volume`,
  `top_set_weight`) still carry no unit column; this PRD does not change that.

No API, schema, or migration changes. No change to how the preferred unit is
chosen (still in the profile editor).

## Design

### UX — sticky per-exercise unit toggle

On each **weight-based** exercise card in the running session, add a compact
iOS-style `kg | lb` segmented toggle in the card header (right-aligned, next to
the exercise name). It reuses the existing
[`Segmented`](../apps/web/src/components/Segmented.tsx) primitive and design
tokens (native-mobile-ux rule — no new styling approach).

```
┌─────────────────────────────────────────────┐
│ ☐  Bench Press                    [ kg | LB ] │   ← unit toggle (per exercise)
│    Target 3×8 · [Chest]                       │
│    Last time 135lb × 8                         │
│    Set 1   135lb × 8                            │
│    [  135  ] (lb)   [  8  ]   [ Log ]          │   ← placeholder reflects unit
└─────────────────────────────────────────────┘
```

- Initial value = `user.preferred_weight_unit` (fallback `kg`).
- The toggle is **local component state** in `ExerciseCard`. Because each card is
  one exercise and stays mounted for the whole running session, the choice is
  naturally sticky for that exercise's sets. It resets to the preferred unit at
  the start of a new session (acceptable for this scope; cross-session memory is
  a possible later enhancement).
- Shown only when the exercise is **weight-based** (`measurement_type !==
  'duration'`) and the session is active (not for completed/read-only sessions or
  duration exercises).
- The weight input's placeholder shows the currently selected unit.

### Data flow

`logSet()` includes the selected unit:

```ts
logMut.mutate({ weight: w, reps: r, weight_unit: unit })
```

The API stores it verbatim on the new `set_entries` row (no defaulting kicks in
because the unit is now explicit). Reads already return `weight_unit` per row and
the card renders it — round-trip complete, no other changes needed.

## Testing

Per [`testing.md`](../.claude/rules/testing.md), ship a unit test **and** an
e2e test under the root `tests/` tree:

- **Unit (web, Vitest)** — render `ExerciseCard` for a weight exercise; assert
  the unit toggle defaults to the user's preferred unit, that switching to `lb`
  updates the placeholder, and that logging a set calls the entry API with
  `weight_unit: 'lb'`.
- **E2E** — a full round-trip proving a set logged in `lb` is **stored and read
  back as `lb`** (not coerced to the preferred unit). Cover via the API e2e
  (create entry with `weight_unit: 'lb'` → read the session → assert stored unit)
  and/or the web e2e set-logging path.

### Verify before done

Run `apps/web` `lint`, `typecheck` (`tsc`), and `build`; run the added unit +
e2e tests (RED without the change, GREEN with it).

## Rollout

Pure additive web UI change, no migration, backward compatible: entries logged
before this change keep their stored unit; new entries store the explicitly
chosen unit. Ship behind no flag.
