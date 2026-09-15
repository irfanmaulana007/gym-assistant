# PRD 0015 — Cardio Toggle on the Muscle Heatmap & a Distinct Session-History Detail

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Approved |
| Created | 2026-09-15 |
| Updated | 2026-09-15 |
| App | web |
| Related PRDs | [0007](0007-analytics-dashboard.md), [0011](0011-profile-muscle-usage-diagram.md), [0013](0013-session-history.md) |

## 1. Problem

Two rough edges around the muscle-group heatmap (`MuscleUsageDiagram`, PRD 0011/0013):

1. **Cardio muddies the "weight training" read.** The body heatmap is meant to
   answer "which muscles did my *lifting* hit?". But on the **post-workout
   summary** and the **session-history detail**, a cardio exercise credits its
   *secondary* muscle groups (`sessionMuscleUsage` sums `sets_completed` into the
   primary **and** every secondary group), so a timed cardio bout can color real
   muscles on the diagram. A user who wants to see only their strength coverage
   has no way to exclude cardio. (On the **Profile** heatmap the data comes from
   the analytics endpoint, which groups by *primary* muscle only, and `cardio`
   has no anatomical mapping — so cardio never colors that diagram today. See
   §3.)

2. **The history detail masquerades as "just finished".** `/sessions/:id` for a
   completed session renders the *same* `SessionSummary` as the moment you finish
   a workout (PRD 0013 §4.3) — including the **"Workout complete"** page title,
   the **"Nice work! 🎉"** encouragement, and a **"Done"** button. When that URL
   is opened from the History list it is a *past* session, not one you just
   finished, so the celebratory framing and the "Done" call-to-action are wrong.

## 2. Goals

1. A **per-view "Include cardio" toggle** on the muscle heatmap on the three
   surfaces that render it — the post-workout summary, the session-history
   detail, and the Profile "Muscles trained" card — so cardio can be excluded
   from the heatmap to see weight-training coverage only.
2. **Distinguish the history detail from the post-finish summary.** When
   `/sessions/:id` is opened as history, drop the "Workout complete" title, the
   "Nice work" encouragement, and the "Done" button; title the screen with the
   **workout group** (routine name) and show the session **date** as a subtitle.
   The celebratory summary stays exactly as-is the moment a workout is finished.

## 3. Non-goals

- **No API or schema change.** Both the analytics `muscle_groups` payload and the
  session detail payload already carry everything needed. Cardio is identified by
  the existing `primary_muscle_group === 'cardio'` value.
- **No persisted preference.** The toggle is **per-view local state** that resets
  on reload (per product decision). No localStorage, no user setting, no cross-
  surface sync. (A future PRD may promote it to a remembered preference.)
- **No secondary-muscle attribution on the Profile heatmap.** That remains a
  primary-only, analytics-derived view (PRD 0011 §7). Consequently the Profile
  toggle only filters the `cardio` row, which has no anatomical color today — so
  it is a *no-op on the body image* until secondary attribution lands. It is
  included for consistency and correctness (the row is dropped from the data fed
  to the diagram), and the toggle only appears when the window actually contains
  cardio, so it never reads as a broken control on strength-only data.
- **No change to the text badges.** The "Muscle groups worked" badges and the
  history list rows stay a factual record of everything trained (cardio
  included). The toggle scopes to the **heatmap** only.

## 4. Design

### 4.1 Cardio identification

An exercise is **cardio** iff its `primary_muscle_group === 'cardio'` — the same
signal the analytics landmark and the dashboard `MuscleBalance` cardio row
already use. A small shared predicate `isCardioExercise(ex)` lives beside
`sessionMuscleUsage` in `src/lib/sessionMuscles.ts`.

### 4.2 The toggle — `Switch` primitive

A new native iOS-style **`Switch`** primitive (`src/components/Switch.tsx`):
`role="switch"`, `aria-checked`, labeled, built from existing tokens
(`--surface-2`, `--primary`, `--radius-pill`, `--shadow-1`, motion tokens) with a
new `.switch` block in `styles.css`. No hover-dependent affordance; ≥44px tap
target — per `.claude/rules/native-mobile-ux.md`.

The toggle is labeled **"Include cardio"**, defaults **off** (cardio excluded),
and is rendered **only when the current view contains cardio** so it never
appears as an inert control on strength-only data.

### 4.3 Session summary & history — `sessionMuscleUsage(session, opts)`

`sessionMuscleUsage` gains an optional `{ includeCardio?: boolean }` (default
`true`, preserving existing callers/tests). When `false`, exercises for which
`isCardioExercise` is true are skipped entirely — removing their primary *and*
secondary contributions from the heatmap.

`SessionSummary` owns a local `includeCardio` state (default `false`), feeds it
into `sessionMuscleUsage`, and renders the `Switch` inside the "Muscle groups
worked" card above the diagram — only when the session has ≥1 cardio exercise.

### 4.4 Profile — `MusclesTrained`

`MusclesTrained` owns a local `includeCardio` state (default `false`). When
`false`, the `cardio` row is filtered out of `data.muscle_groups` before it is
passed to `MuscleUsageDiagram`. The `Switch` renders only when the window's data
contains a `cardio` row.

### 4.5 History detail vs post-finish summary

`SessionSummary` gains a `variant: 'complete' | 'history'` prop (default
`'complete'`):

- **`complete`** (unchanged): the "Nice work! 🎉 / Here's how your session went."
  intro and the "Done" button remain.
- **`history`**: no encouragement intro, no "Done" button; instead a quiet muted
  **date** line (`formatDate(session.performed_at)`) sits at the top for context.

`ActiveSessionPage` decides the variant for a completed session:

- **Just finished in this view** — `completeMut.isSuccess` is `true` (the user
  tapped "Save workout" in this component instance): render `variant="complete"`
  with the `Layout` title **"Workout complete"** (today's behavior).
- **Opened as history** (from the History list, or by reloading/deep-linking the
  URL): render `variant="history"` with the `Layout` title set to the **workout
  group** via the existing `sessionGroupLabel(session, routinesById(routines))`
  (reusing the cached `['routines']` query, exactly as `SessionHistoryPage`
  does). The date subtitle comes from the `history` variant body.

Back behavior is unchanged (`back={-1}`).

## 5. Data flow

| Surface | Muscle source | Cardio filter | New API? |
|---------|---------------|---------------|----------|
| Post-finish summary | `sessionMuscleUsage(session, {includeCardio})` (client) | skip `isCardioExercise` | No |
| History detail | same as above | same | No |
| Profile heatmap | `useMuscleGroups(window)` → analytics (server) | drop `muscle_group === 'cardio'` row | No |

## 6. Testing

Per `.claude/rules/testing.md` — a unit test **and** an e2e test.

- **Unit** (`tests/unit-test/web/`):
  - `sessionMuscles.test.ts` — extend: `includeCardio: false` drops a cardio
    exercise's primary + secondary contributions; `true`/default keeps them.
  - `Switch.test.tsx` — toggles `aria-checked`, fires `onChange`.
  - `SessionSummary.test.tsx` — `variant="history"` hides "Nice work"/"Done" and
    shows the date; `variant="complete"` keeps them; the cardio `Switch` appears
    only with cardio present and filters the diagram's groups.
- **E2E** (`tests/e2e/web/`): finish a workout that includes a cardio exercise →
  post-finish shows "Workout complete" + "Done"; toggling "Include cardio"
  changes the heatmap image `src`; open the same session from History → title is
  the workout group, no "Done" button, date shown.

`lint`, `typecheck`, and `build` for `apps/web` must pass.

## 7. Rollout

Additive, web-only, no flag, no migration, no config. One new primitive
(`Switch`), one prop on `SessionSummary`, one option on `sessionMuscleUsage`, and
local toggle state on two containers.
