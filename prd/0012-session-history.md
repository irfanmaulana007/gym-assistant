# PRD 0012 — Session History & Rich Session Detail

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Approved |
| Created | 2026-09-15 |
| Updated | 2026-09-15 |
| App | web |
| Related PRDs | [0002](0002-session-lifecycle-and-metrics.md), [0007](0007-analytics-dashboard.md), [0009](0009-muscle-group-diagram.md), [0011](0011-profile-muscle-usage-diagram.md) |

## 1. Problem

After a user finishes a workout they get a rich **session summary** (durations,
sets, volume, muscle groups worked, per-exercise breakdown). But that summary is
a dead end:

- There is **no way to browse past sessions.** The `GET /api/v1/sessions` list
  endpoint and its `sessionsApi.list` client wrapper already exist, but nothing
  in the web app ever calls them. A completed session is only reachable by
  guessing its `/sessions/:id` URL.
- The **post-finish summary has no body diagram.** Muscle groups are shown as
  plain text badges only, even though the app already renders an anatomical body
  heatmap elsewhere (`MuscleUsageDiagram`, PRD 0011).

Users want to look back at any past workout and see the same summary they saw
right after finishing it — including a body heatmap of what they trained.

## 2. Goals

1. A browsable **History** of all completed sessions, reachable from a new
   bottom-tab destination.
2. Opening a history entry shows the **exact same summary** rendered right after
   finishing that session (same component, same route `/sessions/:id`).
3. Add a **body heatmap** to that summary, colored by how many sets each muscle
   group received in the session — shown both post-finish and in history.

## 3. Non-goals

- No new API endpoints or schema changes. Everything is derived from data the
  existing `GET /api/v1/sessions` (list) and `GET /api/v1/sessions/{id}`
  (detail) already return.
- No editing/deleting of past sessions (future work).
- No per-session aggregate totals (sets/volume) on the **list** rows — the list
  endpoint does not attach per-exercise detail, so list rows show session-level
  facts only (date, duration, muscle groups). The full breakdown lives on the
  detail. (A future PRD may enrich the list endpoint.)

## 4. Design

### 4.1 Navigation — new "History" tab

Add a fourth destination to the bottom tab bar (`BottomNav`):

```
[ Progress ]  [ Workout ]  [ History ]  [ Profile ]
```

Uses the existing `ClockIcon`. Route `/sessions` → `SessionHistoryPage`. This
follows the native-mobile-ux rule (top-level destinations live in the tab bar,
not behind a header control).

### 4.2 History list — `SessionHistoryPage` (`/sessions`)

- Fetches `sessionsApi.list()` via React Query (`['sessions']`).
- Shows only `status === 'completed'` sessions (active/abandoned are not
  history), most-recent first.
- Each row is a native `nav-row` link to `/sessions/:id` showing:
  - **Date** — `formatDate(performed_at)`.
  - **Active duration** — `formatDuration(active_duration_seconds)`.
  - **Muscle-group badges** — `muscle_groups` (session-level, already stored).
  - A trailing chevron.
- Loading (`Spinner`), error (`ErrorText`), and empty states (a friendly prompt
  to finish a workout).

### 4.3 Session detail = the existing summary

No change to routing: a completed session at `/sessions/:id` already renders
`SessionSummary` inside `ActiveSessionPage`. History rows link straight to it, so
"see the detail just like right after finishing" is satisfied by reusing the same
component.

**Back behavior:** the completed-session screen's back target changes from a
hardcoded `"/workout"` to `-1` (browser back) so it returns to wherever the user
came from — the History list when opened from history, the Workout screen right
after finishing (that is the previous stack entry either way).

### 4.4 Body heatmap on the summary

Reuse the existing `MuscleUsageDiagram` (PRD 0011) — a dual-view anatomical body
SVG colored on a yellow → orange → red gradient by training volume, relative to
the most-trained group.

- A new pure helper `sessionMuscleUsage(session)` (`src/lib/sessionMuscles.ts`)
  derives `MuscleUsageStat[]` (`{ muscle_group, sets }`) from
  `session.exercises`: each exercise contributes its `sets_completed` to its
  `primary_muscle_group` **and** to each of its `secondary_muscle_groups`
  (a muscle "worked" by an exercise gets credit for those sets). Counts are
  summed per muscle group across the session.
- `SessionSummary` renders `<MuscleUsageDiagram groups={usage} />` inside the
  "Muscle groups worked" card, above the existing text badges. The badges stay
  as the accessible/textual source of truth and the fallback when nothing maps
  (cardio/full_body/other) or the image fails — exactly the additive pattern
  from PRD 0009/0011.

**Attribution choice:** counting primary and secondary each as a full set is the
simplest faithful reading of "total sets that worked this muscle," and the
gradient is relative within the session so it stays meaningful. (Alternative —
weighting secondary at a fraction — was rejected as over-engineering for a
single-session view.)

## 5. Data flow

| Surface | Source | New API? |
|---------|--------|----------|
| History list | `GET /api/v1/sessions` (already returns status, durations, `muscle_groups`) | No |
| Session detail + heatmap | `GET /api/v1/sessions/{id}` (already returns `exercises[]` with `primary_muscle_group`, `secondary_muscle_groups`, `sets_completed`) | No |

## 6. Testing

Per `.claude/rules/testing.md`, every change ships a unit **and** an e2e test
under the root `tests/` tree.

- **Unit** (`tests/unit-test/web/`):
  - `sessionMuscles.test.ts` — the `sessionMuscleUsage` helper: primary +
    secondary attribution, summing across exercises, empty/zero-set sessions.
  - `SessionHistoryPage.test.tsx` — renders completed sessions, filters out
    abandoned, empty state, links to detail.
  - `BottomNav.test.tsx` — the new History tab is present and points at
    `/sessions` (extend existing test).
  - `SessionSummary` heatmap wiring (extend/settle in the summary test).
- **E2E** (`tests/e2e/web/session-history.spec.ts`): start → log → complete a
  session, open the History tab, see it listed, open it, and assert the summary
  and the body heatmap image render.

## 7. Rollout

Pure additive web change: one new route, one new tab, one new page, one reused
diagram, one derivation helper. No migrations, no API changes, no config. Ships
behind the normal web build.
