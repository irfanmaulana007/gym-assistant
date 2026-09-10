# PRD 0003 — Edit & Delete on Detail Pages

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Approved |
| Created | 2026-09-10 |
| Updated | 2026-09-10 |
| App | web |
| Extends | [PRD 0001 — Workout Tracking Foundation](0001-workout-tracking-foundation.md) |

## 1. Summary

Move destructive and mutating actions off the **list rows** and onto the
**detail pages** for the two core entities the user manages by hand — a
**workout day** (routine) and an **exercise**. Concretely:

1. **Remove the inline `Delete` control from list items.** The routines list
   (home) and the exercise list (inside the routine detail page) currently
   render a per-row delete button. A list row becomes a pure navigation
   affordance — tapping it opens the entity's detail page and nothing else.
2. **Add `Edit` and `Delete` to each detail page.** The routine detail page and
   the exercise detail page each gain an **Edit** action (a form in a `Sheet`,
   per the app's "forms live in a sheet" rule) and a **Delete** action.

This is a **web-only** change. The API already exposes everything needed —
`PATCH`/`DELETE` for both routines and exercises (`routinesApi.update/remove`,
`exercisesApi.update/remove`) — so no backend or schema work is required.

## 2. Motivation

Inline row-level delete buttons are easy to hit by accident on a phone (the exact
device this app targets) and clutter a list whose primary job is fast navigation.
Editing an entity was not possible in the UI at all, even though the API supports
it — so a typo in a routine name or a wrong target rep count could only be fixed
by deleting and recreating.

Putting mutating actions on the detail page is the conventional mobile pattern
(tap in, then edit/delete), keeps the list clean and safe, and gives edit a
natural home.

## 3. Scope

**In scope (web):**

- Remove the inline delete button from routine list rows (`RoutinesListPage`).
- Remove the inline delete (`✕`) button from exercise list rows
  (rendered in `RoutineDetailPage`).
- Routine detail page: add **Edit** (name + notes) and **Delete** (with confirm;
  navigates back to the list on success).
- Exercise detail page (the exercise history screen): add **Edit** (all exercise
  fields) and **Delete** (with confirm; navigates back to the parent routine on
  success).

**Out of scope:**

- Any API/schema change (the endpoints already exist).
- Reordering (`reorder` endpoints stay unused by this PRD).
- Bulk actions, undo/soft-delete, or swipe-to-delete gestures.

## 4. Design

### 4.1 List rows become navigation-only

Each routine / exercise row is just the existing `<Link>` to the detail page.
The `deleteMut` on `RoutinesListPage` and the exercise `deleteMut` usage on the
list rows are removed.

### 4.2 Detail-page actions

Both detail pages already have a nav-bar `action` slot. We add an **Edit**
(pencil) icon button there; on the routine detail page it sits alongside the
existing `+` (add exercise) action.

Edit opens a `Sheet` pre-filled with the entity's current values:

- **Routine:** `name`, `notes` → `routinesApi.update(id, patch)`.
- **Exercise:** the full create-form field set (name, measurement type,
  sets/reps or duration, primary muscle group) → `exercisesApi.update(id, patch)`.

To avoid duplicating the ~70-line exercise form across the add sheet
(`RoutineDetailPage`) and the edit sheet (exercise detail), the field inputs are
extracted into a shared `ExerciseFormFields` component under
`src/features/exercises/`, reused by both the add and edit sheets. Field labels
are preserved so existing e2e selectors keep working.

**Delete** is a danger button at the bottom of the edit sheet. It confirms via
the browser `confirm()` dialog (matching the existing pattern), then:

- routine → `routinesApi.remove(id)` → navigate to `/` (the list).
- exercise → `exercisesApi.remove(id)` → navigate to the parent routine
  (`/routines/:routineId`, read from the fetched exercise).

On mutation success the relevant React Query keys are invalidated
(`['routines']`, `['routine', id]`, `['exercise-history', id]`).

## 5. Testing

Per [`.claude/rules/testing.md`](../.claude/rules/testing.md), the change ships
with unit **and** e2e tests under the root `tests/` tree:

- **Unit** (`tests/unit-test/web/`): routine list rows render no delete button;
  the routine detail edit sheet updates and deletes; the exercise detail edit
  sheet pre-fills, updates, and deletes.
- **E2E** (`tests/e2e/web/`): create a routine → edit its name on the detail page
  → add an exercise → edit the exercise → delete the exercise → delete the
  routine, asserting each round-trips.

## 6. Rollout

Single web PR. No migration, no API change, no feature flag.
