# PRD 0011 — Muscle-Usage Body Diagram on the Profile Screen

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Approved |
| Created | 2026-09-13 |
| Updated | 2026-09-13 |
| App | web |
| Related docs | [0009 — Muscle-Group Diagram on the Exercise Info Tab](0009-muscle-group-diagram.md), [0007 — Analytics Dashboard](0007-analytics-dashboard.md) |

## 1. Problem

The Profile screen (PRD 0003 / 0008) shows *who* the athlete is — identity,
health data, account details — but nothing about *what they've actually
trained*. A user who wants a quick, visual answer to "which muscles have I been
hitting, and which am I neglecting?" has to open the Progress tab and read the
Muscle-Group Balance bars. Bars are precise but not spatial: they don't map onto
the body, so they don't give the at-a-glance "am I balanced front-to-back,
push-vs-pull, upper-vs-lower?" read that a body map does.

We already render an anatome body diagram on the exercise Info tab (PRD 0009),
but only for a single exercise's target muscles (primary/secondary). We have not
yet used the same visual to summarize a user's whole training history.

## 2. Goal

Add a **muscle-usage body diagram** (front + back) to the Profile screen that
colors each muscle group by **how much the user has trained it**, so the athlete
can visually check their muscle coverage and spot imbalances without leaving the
Profile screen.

The more a muscle group is trained, the **bolder/warmer** its color — a
yellow → orange → red gradient.

### Non-goals

- No new backend endpoint or schema change — reuse the existing
  `GET /api/v1/analytics/muscle-groups` (PRD 0007).
- No per-exercise drill-down from the diagram (the Progress tab already links
  exercises to their history).
- No change to the exercise Info-tab diagram (PRD 0009) — that stays a
  primary/secondary view of one exercise.
- No secondary-muscle attribution in this release (see §7, Known limitations).

## 3. Users & value

Any signed-in athlete with at least one completed workout. Value: a native,
spatial, motivating summary of training coverage on the screen they already
associate with "me" — reinforcing progressive-overload balance across the body.

## 4. Design

### 4.1 Data source

Reuse the existing analytics muscle-group breakdown:

- Endpoint: `GET /api/v1/analytics/muscle-groups?window=<w>&tz=<tz>` (already
  implemented; auth-scoped, read-only). Returns
  `{ window, volume_unit, muscle_groups: MuscleGroupStat[] }` where each
  `MuscleGroupStat` is `{ muscle_group, sets, volume, frequency, undertrained }`.
- Add a thin web client `analyticsApi.muscleGroups(window)` and a
  `useMuscleGroups(window)` react-query hook (keyed by window). This is lighter
  than pulling the whole `/dashboard` payload for a single visual.

### 4.2 Intensity metric

**Sets completed** drives the color intensity — the same metric the Progress
Muscle-Group Balance bars use, and the most intuitive answer to "how much did I
train this?". `volume`/`frequency` remain available in the payload but are not
used for coloring in this release.

### 4.3 Color scale — relative to the user's own max

Coloring is **relative to the user's most-trained muscle group in the window**,
so the diagram always shows a full range regardless of overall training volume
and adapts to any experience level.

Let `max = max(sets)` over mapped groups with `sets > 0`. For each such group,
`ratio = sets / max` selects a tier:

| Tier | Ratio | Color (hex) | Meaning |
|------|-------|-------------|---------|
| 4 | `ratio > 0.75` | `#DC2626` red | Trained the most |
| 3 | `0.5 < ratio ≤ 0.75` | `#F97316` deep orange | |
| 2 | `0.25 < ratio ≤ 0.5` | `#F59E0B` amber/orange | |
| 1 | `0 < ratio ≤ 0.25` | `#FDE047` yellow | Trained the least |

Groups with `sets = 0` (or that don't map to an anatomical region —
`full_body` / `cardio` / `other`) get **no layer** and render in the diagram's
default neutral body color, visually reading as "untrained". The most-trained
group is always red; the scale degrades gracefully so even a user who trained a
single muscle sees a colored diagram.

### 4.4 Rendering

Same mechanism as PRD 0009: an `<img>` pointing at anatome's `generateImage`
endpoint with `view=dual` (front + back), `output=raw`, and a `layers` param
composed as `HEX:key,key|HEX:key,...`. The web app only maps our
`MuscleGroup` enum → anatome keys (reusing `MUSCLE_GROUP_TO_ANATOME` from PRD
0009) and buckets each group into a color tier.

A new pure builder pair in `apps/web/src/lib/muscleDiagram.ts`:

- `buildMuscleUsageLayers(stats)` → the `layers` string (or `null` when nothing
  maps / nothing trained). Assigns each anatome key to the highest tier it
  appears in; emits color segments in tier order (red → yellow).
- `buildMuscleUsageDiagramUrl(stats, options)` → the full URL (or `null`).

These sit beside the existing exercise builders (`buildMuscleLayers` /
`buildMuscleDiagramUrl`), which are unchanged.

### 4.5 UI on the Profile screen

A new **"Muscles trained"** section on `ProfilePage`, above/near the existing
sections, containing a `.card` with:

- A **window selector** (`Segmented`: Week / Month / 3M / All), defaulting to
  **Month**, matching the Progress dashboard's control.
- The **`MuscleUsageDiagram`** component: the dual-view body image with a
  loading skeleton, plus a **gradient legend** reading *Less → More* (a
  yellow→red bar) so the color scale is self-explanatory.
- **Graceful degradation** (native, quiet): while loading, a skeleton; on empty
  (no trained muscles in the window) or image error, a short muted line
  ("No muscles trained in this window yet." / nothing) — never a broken image or
  an empty body with a misleading legend.

Built entirely from existing tokens/primitives (`Layout`, `.section-label`,
`.card`, `Segmented`, `--sp-*`, radii, the existing muscle-diagram figure/skeleton
styles). Mobile-first, no hover-dependent affordances, no desktop popovers — per
`.claude/rules/native-mobile-ux.md`.

### 4.6 Config

Reuses `VITE_ANATOME_BASE_URL` from PRD 0009. No new config.

## 5. Rollout

Additive, web-only, behind no flag. Ships with the profile section visible to
all users; the empty/loading/error states cover the zero-data case, so there is
nothing to gate.

## 6. Testing

Per `.claude/rules/testing.md` — a unit test **and** an e2e test:

- **Unit** (`tests/unit-test/web/`): `buildMuscleUsageLayers` /
  `buildMuscleUsageDiagramUrl` — tier bucketing relative to max, skipping
  `sets=0` and unmapped groups, highest-tier-wins per key, `null` on empty; and
  a `MuscleUsageDiagram` render test (legend + graceful null on empty/error).
- **E2E** (`tests/e2e/web/`): register → run a workout that trains a muscle →
  open Profile → the "Muscles trained" section renders the diagram; switching
  the window keeps it working.

`lint`, `typecheck`, and `build` for `apps/web` must pass.

## 7. Known limitations / future work

- **Primary-muscle only.** The backend `muscle_groups` aggregation tallies each
  session exercise by its **primary** muscle group; secondary groups are not
  counted. The diagram therefore reflects primary training load. Adding
  secondary attribution is a backend change deferred to a future PRD.
- A future iteration could let the user toggle the metric (sets / volume /
  frequency) or switch to absolute weekly-set landmarks for a "vs. target" view.
