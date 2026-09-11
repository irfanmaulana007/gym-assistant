# PRD 0007 — Analytics Dashboard (Progress at a Glance)

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Implemented |
| Created | 2026-09-11 |
| Updated | 2026-09-11 |
| App | api, web |
| Extends | [PRD 0001 — Workout Tracking Foundation](0001-workout-tracking-foundation.md), [PRD 0002 — Session Lifecycle, Exercise Types & Metrics](0002-session-lifecycle-and-metrics.md), [PRD 0006 — Exercise Catalog (Master Data)](0006-exercise-catalog.md) |

## 1. Summary

Build the **analytics dashboard** — the read-only screen that answers *"am I
making progress, and am I training consistently and in balance?"* at a glance.
This is the dashboard [PRD 0002 explicitly deferred](0002-session-lifecycle-and-metrics.md#4-non-goals-this-phase)
while making sure every metric it needs was captured up front.

Progressive overload is the product's north star, so the dashboard leads with
**overload signals** (volume trend, per-exercise progress, personal records) and
supports them with **consistency** (streaks, weekly frequency, training minutes)
and **balance** (sets/volume per muscle group, undertrained groups). It is a
**pure read-model** — it computes projections from `workout_sessions`,
`session_exercises`, and `set_entries`; it stores no new domain data.

Spans **api** (a small set of aggregation endpoints over the existing tables and
the `pkg/overload` primitives) and **web** (a new **Progress** tab in the bottom
nav with a mobile-first dashboard of metric cards and charts).

## 2. Motivation

Today a user can see progress only **one exercise at a time** (the exercise
history screen, `GET /exercises/{id}/history`) or **one session at a time**
(session detail). There is no place that answers the questions that actually keep
someone training:

- **Am I overloading?** Is my total volume trending up week over week? Which
  exercises are climbing, and which are **stalled** and need attention?
- **Am I consistent?** How many workouts this week/month, what's my streak, how
  many days since I last trained, how many training minutes am I logging?
- **Am I balanced?** Am I hitting each muscle group enough times a week, or is
  something (legs, pull, core) being neglected?

All the raw material already exists — PRD 0002 deliberately captured session
timing, per-exercise/per-set metrics, and muscle groups, and
[its §6 "metrics footprint"](0002-session-lifecycle-and-metrics.md#6-metrics-footprint-dashboard-readiness-checklist)
lists exactly these as *"derivable without extra storage."* PRD 0006 made
muscle-group tagging **consistent across routines** via the catalog, which is
what makes per-muscle-group aggregation trustworthy. What is missing is the
**aggregation queries and the screen**. This PRD adds exactly that — no schema
changes.

## 3. Scope

**In scope:**

- **api** — a small family of **auth-scoped, read-only analytics endpoints** that
  aggregate the authenticated user's completed sessions over a **time window**:
  an overview summary, a volume time-series, a per-muscle-group breakdown, a
  consistency/streak calc, personal records, and per-exercise progress/stall
  signals. Reuses `pkg/overload` (volume, best set, trend) and the persisted
  `session_exercises` aggregates.
- **api** — a single composed `GET /analytics/dashboard?window=` that returns the
  whole default screen in one round-trip (mobile-friendly), with the deep-dive
  data available from focused endpoints.
- **web** — a new **Progress** tab in the bottom nav (`BottomNav`) → a
  `DashboardPage` of metric cards + charts, mobile-first per
  [`.claude/rules/native-mobile-ux.md`](../.claude/rules/native-mobile-ux.md),
  built from existing design tokens/primitives.
- **web** — a **window selector** (This week / This month / 3 months / All time),
  and tap-through from a metric card to the existing deep-dive screen (e.g. a PR
  or trending exercise → that exercise's history page).
- **Tests** — unit + e2e per [`.claude/rules/testing.md`](../.claude/rules/testing.md).

**Out of scope (this phase):**

- **No new stored data / no schema migration.** The dashboard is a projection.
  If a metric truly cannot be derived, it is deferred, not denormalized.
- **1RM programming & auto-progression suggestions** — we *display* estimated 1RM
  and flag stalls, but we do **not** prescribe next weights or generate programs.
- **Goal-setting / targets UI** (e.g. user sets "16 sets of back per week"). We
  ship sensible **default landmarks** for the balance view; user-editable targets
  are a later PRD (noted in Open Questions).
- **Body metrics** (bodyweight, measurements, photos) — not captured today.
- **Exports / sharing / PDF reports.**
- **Cross-user or social comparisons.**
- **Cardio-distance analytics** (pace/distance trends) beyond counting cardio
  minutes toward training time — strength overload is the focus; distance
  dashboards are a follow-up.

## 4. Metrics — what the dashboard shows

Grouped by the three questions. Every metric below is derivable **today** from
stored columns (see §4.4 for the mapping). Metrics are computed over a selected
**time window** unless noted as all-time.

### 4.1 Progress / overload (the headline)

| Metric | Definition | Source |
|--------|------------|--------|
| **Total volume, this window + trend** | Σ (`weight` × `reps`) across completed sessions in the window, vs. the previous equal window (▲/▼ %). | `set_entries` / `session_exercises.total_volume` |
| **Volume over time** | Volume bucketed per week (or per session for short windows) — a sparkline/bar the user reads as "going up." | bucket by session date |
| **Trending-up exercises** | Exercises whose top-set weight increased over their recent sessions (`direction: up`). | `pkg/overload.TrendFromTopWeights` |
| **Stalled exercises** ⚠️ | Exercises with ≥ N sessions and **no top-set-weight increase** over the last N (default N=3) — the "needs a push" list. | top-set series per exercise |
| **Personal records (PRs)** | Per exercise: heaviest set ever, and **estimated 1RM** (Epley: `weight × (1 + reps/30)`); highlight PRs *set within this window* as "New PR ✨". | all-time `set_entries`, filtered |
| **Est. 1RM trend** (deep-dive) | Best estimated-1RM per session for a chosen exercise. | history endpoint + Epley |

### 4.2 Consistency / adherence

| Metric | Definition | Source |
|--------|------------|--------|
| **Workouts this week / this month** | Count of `completed` sessions in the period. | `workout_sessions.status`, date |
| **Current streak** | Consecutive **weeks** each with ≥ 1 completed session (default; see Open Q on daily vs weekly). Also show **longest streak**. | distinct session weeks |
| **Days since last workout** | Today − most recent completed session date. Nudges when it grows. | latest session date |
| **Training minutes** | Σ `active_duration_seconds` in the window (the "real" work time, excludes pauses) + avg session length. | `workout_sessions.active_duration_seconds` |
| **Activity calendar** | A month heatmap of which days had a session (native "contribution graph" feel). | session dates |

### 4.3 Balance / coverage

| Metric | Definition | Source |
|--------|------------|--------|
| **Sets per muscle group** | Σ `sets_completed` attributed to each `primary_muscle_group` over the window — the classic weekly-sets landmark view. | `session_exercises.sets_completed` + `primary_muscle_group` |
| **Volume per muscle group** | Σ volume per `primary_muscle_group` (share-of-total donut/bar). | `session_exercises.total_volume` |
| **Muscle-group frequency** | How many distinct sessions trained each group (times/week). | `workout_sessions.muscle_groups[]` |
| **Undertrained groups** ⚠️ | Groups below a **default weekly landmark** (e.g. < ~10 sets/week for major groups) — the "you're neglecting X" flag. | sets/group vs. default |

> **Attribution rule:** sets/volume are attributed to the exercise's
> **`primary_muscle_group`** only, to avoid double-counting. Secondary groups are
> reserved for a possible future "assisting volume" view (Open Questions).

### 4.4 Data source mapping (proof it's derivable — no new storage)

Everything above maps to columns already persisted by PRD 0002 (and made
consistent by PRD 0006):

- **Sessions & timing** — `workout_sessions(status, started_at, ended_at,
  active_duration_seconds, total_duration_seconds, muscle_groups[])`, indexed
  `(user_id, started_at)` for time-window scans.
- **Per-exercise aggregates** (already computed on session complete via
  `SessionRepository.RecomputeAggregates`) —
  `session_exercises(sets_completed, total_reps, total_volume, top_set_weight,
  primary_muscle_group, completed_at)`.
- **Per-set detail** (for PRs / est-1RM, which need weight×reps at the set level)
  — `set_entries(weight, weight_unit, reps, performed_at)`.
- **Derivation primitives** — `pkg/overload` already provides `TotalVolume`,
  `BestSet`, `LastTopSet`, and `TrendFromTopWeights`; the per-exercise history
  logic in `exercise_service.go` already builds per-session top-set series.

This confirms PRD 0002 §6's promise: the dashboard is a **read-model with no
backfill**.

### 4.5 The weight-unit problem (must-solve)

`set_entries.weight` carries a **per-row `weight_unit` (kg | lb)** and the API
does **not** normalize units anywhere today — volume math (`weight × reps`)
currently ignores the unit. Aggregating volume/PRs across rows of mixed units
would produce **nonsense totals**. The dashboard must not.

**Decision:** aggregation **normalizes every weight to a single display unit
before summing.** For Phase 1 (single-user, kg-default per the API's
`COALESCE(..., 'kg')`), the dashboard aggregates in **kg** and converts any `lb`
rows (`lb × 0.45359237`). The chosen unit is surfaced on the screen ("Volume
(kg)"). A user-level unit preference is noted in Open Questions; the conversion
lives in one pure helper (`pkg/analytics` or extend `pkg/overload`) so switching
the display unit is trivial and unit-testable.

## 5. API design

Additive, all under `/api/v1`, all **auth-scoped to the authenticated user**
(never a client-sent id), all **read-only** (GET). Completed sessions only
(`status = 'completed'`) unless stated.

### 5.1 Shared query params

- `window` — `week` | `month` | `quarter` | `year` | `all` (default `month`).
  Resolved **server-side** against the request time to a `[from, to)` range so a
  client clock can't skew buckets. `week`/`month` mean the current calendar
  week/month.
- `tz` — optional IANA timezone (e.g. `Asia/Jakarta`) so "this week", day
  bucketing, and the calendar align to the user's local days, not UTC. Defaults
  to UTC if omitted.

### 5.2 Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/analytics/dashboard` | **Composed** payload for the default screen — summary + volume series + muscle-group breakdown + consistency + top PRs + trending/stalled — in one round-trip. |
| `GET` | `/api/v1/analytics/summary` | Overview tiles: workouts, training minutes, total volume (+ prev-window deltas), streak, days-since-last. |
| `GET` | `/api/v1/analytics/volume` | Volume (and sets) time-series bucketed `?bucket=week\|session`. |
| `GET` | `/api/v1/analytics/muscle-groups` | Per-`primary_muscle_group` sets, volume, frequency, and an `undertrained` flag. |
| `GET` | `/api/v1/analytics/consistency` | Streak (current/longest), per-day/week session counts for the activity calendar. |
| `GET` | `/api/v1/analytics/records` | Personal records per exercise (heaviest set, est-1RM) with an `is_new_this_window` flag. |
| `GET` | `/api/v1/analytics/exercise-trends` | Per-exercise `direction` (up/down/flat) + `stalled` flag, reusing `TrendFromTopWeights`. |

The web app uses **`/analytics/dashboard`** for first paint; the focused
endpoints back deep-dive views and keep each concern independently testable. All
return the standard JSON envelope and empty-but-valid payloads for a new user
with no sessions (no 404s — the screen shows an empty state).

### 5.3 Implementation notes

- New `AnalyticsService` + `AnalyticsRepository` (`apps/api/internal/service`,
  `.../repository`) with **windowed aggregate SQL** (`SUM`, `COUNT`,
  `date_trunc`, `GROUP BY primary_muscle_group`) over `workout_sessions` joined to
  `session_exercises` — the first cross-session, per-muscle, per-week queries in
  the codebase (today only single-exercise history and single-session aggregates
  exist). Scope **every** query with `WHERE workout_sessions.user_id = $1`.
- Reuse the `(user_id, started_at)` index; add a covering index only if a query
  plan shows it's needed (measure first — no speculative denormalization).
- PRs / est-1RM need set-level rows → aggregate from `set_entries` (join through
  `session_exercises`), normalizing units per §4.5.
- Pure, unit-testable helpers (Epley 1RM, unit conversion, streak from a set of
  dates, undertrained landmark) live in `pkg/` so the `tests/` module can import
  them directly (same pattern as `pkg/catalog` in PRD 0006).

## 6. Web UX (mobile-first)

A new top-level **Progress** tab — a native dashboard, not a shrunk desktop
report. Follows [`.claude/rules/native-mobile-ux.md`](../.claude/rules/native-mobile-ux.md):
single column, `--max-width` clamp, safe-area insets, ≥44px targets, design
tokens only, no desktop popovers/hover affordances.

- **Bottom nav** gains a third tab between Home and Profile:
  `Home · Progress · Profile` (`BottomNav`, new chart icon in `icons.tsx`), route
  `/dashboard` → `DashboardPage` (protected).
- **Header + window selector** — a `Segmented` control (reusing the existing
  component) for **Week / Month / 3M / All**; changing it refetches.
- **Card stack (top → bottom), overload first:**
  1. **Summary tiles** — Workouts · Training minutes · Total volume (each with a
     ▲/▼ vs. previous window) · Streak · Days since last.
  2. **Volume trend** — a compact bar/sparkline (weeks or sessions). Per the
     [`dataviz`](../.claude/skills) guidance: one accessible series, light/dark
     aware, value labels, horizontal-scroll container if wide.
  3. **Progress signals** — "Trending up ▲" list and a **"Needs a push ⚠️"**
     (stalled) list; each row taps through to that exercise's history page
     (`/exercises/{id}/history`, PRD 0004).
  4. **Personal records** — recent PRs, "New PR ✨" badge for ones set in-window.
  5. **Muscle-group balance** — sets-per-group bars (or donut) with
     **undertrained** groups flagged; reuses `muscleGroupLabel` from PRD 0006.
  6. **Activity calendar** — month heatmap of session days.
- **Empty state** — a new user with no completed sessions sees an encouraging
  empty dashboard ("Finish your first workout to see progress") — never a spinner
  or error.
- **Data layer** — `analyticsApi` in `src/api/` + a `useDashboard(window)` query
  hook (React Query, matching existing hooks); charts are lightweight (SVG/CSS or
  the app's existing chart approach on the exercise-history screen) — no heavy new
  chart dependency unless the history screen already uses one.

## 7. Testing

Per [`.claude/rules/testing.md`](../.claude/rules/testing.md) — ships with unit
**and** e2e tests under the root `tests/` tree, on dedicated ports (never local
`:5173`/`:8080`/`:5432`).

**API**

- **Unit** (`tests/unit-test/api/`): the pure helpers — Epley est-1RM; kg/lb
  normalization (a mixed-unit exercise sums correctly in kg — the §4.5 guard);
  streak from a set of dates (gaps break it, longest ≥ current); undertrained
  landmark thresholding; window→`[from,to)` resolution incl. `tz`.
- **E2E** (`tests/e2e/api/`, embedded Postgres): seed a user with several
  completed sessions across weeks/muscle groups → assert `/analytics/dashboard`
  and each focused endpoint return correct volume totals + deltas, per-group
  sets, streak, and PRs; assert a **mixed kg/lb** exercise aggregates to the right
  kg total; assert a fresh user gets a valid **empty** payload (200, zeros — not
  404); assert every query is user-scoped (a second user's data never leaks).

**Web**

- **Unit** (`tests/unit-test/web/`): `DashboardPage` renders tiles/cards from a
  mocked payload; the window `Segmented` triggers a refetch with the right param;
  the empty state renders with no sessions; a stalled/PR row links to the correct
  exercise-history route.
- **E2E** (`tests/e2e/web/`): log in → complete a workout (or seed one) → open the
  **Progress** tab → see non-zero workouts/volume and a muscle-group breakdown →
  switch the window and see the numbers update → tap a trending exercise and land
  on its history page.

A new test must **fail without the change and pass with it**. Because the
dashboard reads across the full lifecycle, the reproduce-first/round-trip rule
([`bug-fixing.md`](../.claude/rules/bug-fixing.md)) applies to any bug: verify the
number on screen against the underlying rows.

## 8. Rollout

Each a reviewable PR to `main` (never draft; labeled per
[`pr-labeling.md`](../.claude/rules/pr-labeling.md)):

1. **This PRD** — `[docs]` (this change), + index row in `prd/README.md`.
2. **`[api][feat]`** — `AnalyticsService`/repository + `pkg` helpers +
   `/analytics/*` endpoints + unit conversion; API unit + e2e tests.
3. **`[web][feat]`** — Progress tab, `DashboardPage`, `analyticsApi`/hook, cards
   + charts, empty state; web unit + e2e tests.

No migration and no feature flag — the endpoints are additive and read-only, and
the tab is purely additive to the nav. The dashboard degrades gracefully (empty
state) until sessions exist.

## 9. Success metrics

- Every metric in §4 renders on the Progress tab **from stored columns with no
  backfill** — confirming PRD 0002 §6's dashboard-readiness promise.
- Aggregations are **correct and user-scoped**: totals match a hand-computed
  fixture (incl. a mixed-unit case), and no query returns another user's rows.
- First paint of the default (month) dashboard is **one API round-trip** and
  renders fast on a phone.
- The screen answers the three questions at a glance: *making progress?*,
  *training consistently?*, *training in balance?*

## 10. Open questions

1. **Streak granularity** — consecutive **weeks with ≥1 session** (proposed,
   resilient to rest days) vs. consecutive **training days**. Weekly is friendlier
   for typical 3–5×/week training; daily is stricter. *Leaning weekly, show both
   current + longest.*
2. **Balance landmarks** — the "undertrained" thresholds (e.g. ~10 sets/week for
   major groups, fewer for small groups) — ship as sensible **defaults** now;
   **user-editable weekly targets** are a later PRD.
3. **Secondary-muscle attribution** — count sets/volume to `primary` only
   (proposed, avoids double-counting) vs. add a fractional "assisting volume" view
   later.
4. **User unit preference** — Phase 1 aggregates in **kg** (§4.5). A per-user
   preferred display unit (kg/lb) with on-the-fly conversion is a small follow-up
   once a settings surface exists (Profile screen, PRD 0003).
5. **Bucketing for long windows** — week buckets for ≤ ~6 months; switch to month
   buckets for `year`/`all` to keep the chart readable. *Proposed; confirm in
   implementation.*
6. **Cardio in "volume"** — duration/distance exercises have no `weight × reps`,
   so they contribute **0 volume** but **do** count toward training minutes and
   session frequency. Confirm this is the desired treatment (proposed: yes; a
   separate cardio-minutes tile if it needs prominence).
