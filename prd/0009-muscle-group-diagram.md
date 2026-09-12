# PRD 0009 — Muscle-Group Diagram on the Exercise Info Tab

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Implemented |
| Created | 2026-09-11 |
| Updated | 2026-09-12 |
| App | web |
| Extends | [PRD 0002 — Session Lifecycle, Exercise Types & Metrics](0002-session-lifecycle-and-metrics.md), [PRD 0006 — Exercise Catalog (Master Data)](0006-exercise-catalog.md) |
| Source inputs | [anatome](https://github.com/Rippy1911/anatome) (muscle-diagram API, Apache-2.0, keyless, self-hostable on Cloudflare Workers) |

## 1. Summary

Show an **anatomical muscle-group diagram** on the exercise detail screen's
**Info** tab (`/exercises/{id}/history`), so a user instantly *sees* which
muscles a movement works — **primary muscles in red, secondary muscles in
amber** — instead of reading only text badges.

The diagram is produced by [**anatome**](https://github.com/Rippy1911/anatome)'s
`generateImage` endpoint, which returns a **raw SVG** (`output=raw`) that renders
directly in an `<img>` tag. Crucially, the image is a **pure function of data we
already store** — `exercise.primary_muscle_group` and
`exercise.secondary_muscle_groups[]` — so this needs **no new domain data, no
schema migration, and no API changes**. The web app maps our muscle-group enum to
anatome's muscle keys, builds the URL, and renders the SVG.

This is the first of a planned pair: **muscle diagram now** (this PRD), **how-to
GIFs / step photos later** (a follow-up PRD).

## 2. Motivation

Today the Info tab (`apps/web/src/features/exercises/ExerciseHistoryPage.tsx`,
the "Muscles worked" card) shows muscle groups as **text badges only** — a
primary badge plus secondary badges via `muscleGroupLabel()`. It is correct but
not glanceable: a beginner reading "posterior deltoids, triceps" does not
immediately know *where on the body* that is or how the movement loads them.

A labelled body diagram is the universal vocabulary of every serious training
app. We already capture the exact data it needs — PRD 0006 made muscle-group
tagging **consistent across routines** via the catalog, and every exercise
(catalog-linked *and* custom) carries a `primary_muscle_group` and
`secondary_muscle_groups[]`. We are sitting on the inputs and rendering none of
the picture. This PRD turns that stored data into a visual, with **zero new
storage**.

## 3. Scope

**In scope:**

- **web** — a `MuscleDiagram` component in the Info tab's "Muscles worked" card
  that renders anatome's raw SVG (`<img>`), with **primary muscles red
  (`#DC2626`)** and **secondary muscles amber (`#F59E0B`)**, shown in **dual
  (front + back)** view.
- **web** — a pure **muscle-group → anatome-muscle mapping** (our enum → anatome
  keys) plus a small URL builder, both unit-testable.
- **web** — graceful degradation: groups with no anatome mapping
  (`full_body`, `cardio`, `other`) and any diagram-load failure fall back to the
  **existing text badges**, which always remain visible.
- **web** — the anatome host is configurable via a **Vite env var**
  (`VITE_ANATOME_BASE_URL`), mirroring the existing `VITE_API_BASE_URL` pattern.
- **infra / ops (deployment)** — the rate-limit decision (§6): either accept the
  hosted API with aggressive caching, or self-host the anatome Worker. No
  application-code dependency either way — only the env var's value changes.
- **Tests** — unit + e2e per [`.claude/rules/testing.md`](../.claude/rules/testing.md).

**Out of scope (this phase):**

- **No API / backend change and no schema migration.** The diagram is derived
  entirely client-side from fields the API already returns.
- **How-to GIFs / step-by-step photos** (anatome `exerciseGif`, or public-domain
  step images from [free-exercise-db](https://github.com/yuhonas/free-exercise-db)) —
  a **follow-up PRD**. This PRD deliberately ships the muscle picture alone.
- **Interactive / tappable muscle regions** (selecting a muscle to filter or
  learn more). We render a static labelled image; interactivity is a later idea.
- **Per-muscle (finer-grained) tagging.** We color at our **muscle-group**
  granularity; we do not introduce individual-muscle data (e.g. "upper vs. lower
  chest").
- **Editing/choosing the view** (front-only vs. back-only) from the UI — we ship
  one sensible default (dual).
- **Anatome account features** (OAuth logging endpoints) — we use only the
  keyless, read-only `generateImage` endpoint.

## 4. Design — deriving the diagram from stored data

### 4.1 The core insight

anatome's `generateImage` renders a body SVG colored by a `layers` parameter of
the form:

```
layers = <HEX>:<muscle,muscle,…> | <HEX>:<muscle,muscle,…>
```

The output is a **standalone SVG document** (`output=raw`,
`viewBox="0 0 1448 1448"`) that an `<img src>` renders like any image — no client
SVG library, no parsing. Because the layers are driven solely by **which muscle
groups an exercise trains**, the image is a deterministic function of
`(primary_muscle_group, secondary_muscle_groups[], view)` — all already in the
`Exercise` payload (`apps/web/src/types/api.ts`). Nothing new is fetched from
*our* API.

### 4.2 Muscle-group mapping (our enum → anatome keys)

Our enum (migration `0001`, mirrored in `MUSCLE_GROUP_SECTIONS`):
`chest, back, shoulders, biceps, triceps, forearms, quads, hamstrings, glutes,
calves, core, full_body, cardio, other`.

anatome's accepted muscle keys (from `GET /listMuscles`): `abs, lower-back,
obliques, biceps, chest, deltoids, forearm, neck, trapezius, triceps, upper-back,
adductors, calves, gluteal, hamstring, quadriceps, tibialis` (+ non-muscle
regions like `head`, `hands` we don't use).

The mapping is a small, static, one-way constant (one group → one-or-more anatome
keys):

| Our enum | anatome layer key(s) |
|----------|----------------------|
| `chest` | `chest` |
| `back` | `upper-back, lower-back, trapezius` |
| `shoulders` | `deltoids` |
| `biceps` | `biceps` |
| `triceps` | `triceps` |
| `forearms` | `forearm` |
| `quads` | `quadriceps` |
| `hamstrings` | `hamstring` |
| `glutes` | `gluteal` |
| `calves` | `calves` |
| `core` | `abs, obliques` |
| `full_body` | *(unmapped — fallback, see §4.4)* |
| `cardio` | *(unmapped — fallback)* |
| `other` | *(unmapped — fallback)* |

> If anatome's muscle vocabulary changes, only this one constant changes — it is
> the single point of coupling to the external service.

### 4.3 Building the `layers` string

1. Map `primary_muscle_group` through the table → the **red** key set
   (`#DC2626`).
2. Map each entry of `secondary_muscle_groups[]` → the **amber** key set
   (`#F59E0B`).
3. **Primary wins:** remove from the amber set any anatome key already in the red
   set (a muscle that is both primary and secondary renders red, never
   double-colored). Dedupe within each set.
4. Build `layers = DC2626:<red keys> | F59E0B:<amber keys>`, omitting a color
   segment whose set is empty.
5. Compose the URL with `URLSearchParams` so `|` and `,` are correctly encoded:
   `${VITE_ANATOME_BASE_URL}/generateImage?view=dual&output=raw&layers=<encoded>`.

`view=dual` (front + back) is the default so posterior groups (`back`, `glutes`,
`hamstrings`, `calves`) are actually visible. View selection stays a constant for
now (out of scope to expose in UI).

### 4.4 Fallback behavior (always-correct text remains)

The **existing text badges are never removed** — the diagram is additive on top
of them. The diagram is **hidden** (badges only) when:

- The exercise's primary group maps to nothing **and** no secondary group maps to
  anything (e.g. a pure `cardio`/`full_body`/`other` exercise) — there is nothing
  meaningful to color, so we don't render an empty body.
- The SVG fails to load (`<img onError>` → hide the image). A broken-image icon
  must never appear; the card silently falls back to the badges it already shows.

This guarantees the card is **correct and complete with or without** the external
service — the diagram is an enhancement, not a dependency of correctness.

## 5. Web UX (mobile-first)

Follows [`.claude/rules/native-mobile-ux.md`](../.claude/rules/native-mobile-ux.md):
design tokens only, single column, no hover-dependent affordances, no desktop
chrome.

- The **"Muscles worked"** card in the Info tab gains the diagram **above** the
  existing primary/secondary badge row. The badges stay as the textual legend.
- A tiny inline **legend**: a red swatch = *Primary*, an amber swatch = *Secondary*
  (uses the exact `#DC2626` / `#F59E0B` the image uses, surfaced as design tokens
  so the legend and the SVG never drift).
- The SVG sits in a **fixed-aspect, `max-width: 100%`** container (it has a
  1:1-ish `viewBox`), centered, so it scales cleanly on a phone and never causes
  horizontal scroll.
- A lightweight **loading placeholder** (skeleton/neutral box at the reserved
  aspect ratio) prevents layout shift while the SVG loads; on error it collapses
  to nothing (badges remain).
- `<img alt>` describes the worked muscles (e.g. "Muscles worked: chest
  (primary), triceps and shoulders (secondary)") for accessibility, reusing
  `muscleGroupLabel()`.

## 6. External-service strategy (rate limit)

anatome's hosted API (`https://api.anatome.dev`) is **keyless** but limited to
**50 requests per caller/day** — fine for a demo, not for real traffic. Two
mitigations, not mutually exclusive:

1. **Caching (always do this).** The SVG is a pure function of
   `(muscle combo, view)`, so there is only a **bounded, small** set of distinct
   images across all exercises. Standard browser/CDN caching (and the fact that a
   user re-opening the same exercise re-requests an identical URL) collapses most
   traffic. We may additionally pre-warm / cache popular combinations.
2. **Self-host the Worker (recommended for production).** anatome is Apache-2.0
   and self-hostable on **Cloudflare Workers** (catalog needs no D1) — which we
   already operate (Cloudflare accounts are already in use for this project).
   Self-hosting removes the 50/day ceiling entirely. The app only needs
   `VITE_ANATOME_BASE_URL` pointed at our host — **no code difference**.

**Decision:** build against the env var from day one; ship dev/staging against the
hosted API (with caching), and **self-host before meaningful production traffic**.
This keeps application code identical across environments.

## 7. Testing

Per [`.claude/rules/testing.md`](../.claude/rules/testing.md) — ships with unit
**and** e2e tests under the root `tests/` tree, on dedicated ports (never local
`:5173`/`:8080`/`:5432`). No external network in tests — the anatome base URL is
stubbed/intercepted; we assert the **URL we build**, not anatome's rendering.

**Unit** (`tests/unit-test/web/`):

- The mapping + `layers` builder (pure function):
  - primary `chest` + secondary `[triceps, shoulders]` →
    `DC2626:chest|F59E0B:triceps,deltoids`.
  - `back` expands to `upper-back,lower-back,trapezius`.
  - **Primary wins** — a group appearing in both primary and secondary is red
    only, never in the amber set.
  - Dedupe within a color set.
  - `full_body`/`cardio`/`other`-only exercise → builder signals "no diagram"
    (fallback).
- `MuscleDiagram` component: renders an `<img>` with the correctly encoded URL for
  a given exercise; renders **nothing** (badges-only) when the group is unmapped;
  hides the image on `onError`.

**E2E** (`tests/e2e/web/`):

- Log in → open an exercise whose primary group maps (e.g. a chest press) →
  the Info tab shows the diagram `<img>` whose `src` targets
  `…/generateImage` with `DC2626:chest` in the (decoded) `layers`, and the legend
  is present.
- Open a `cardio`/`other` exercise → **no diagram**, text badges still shown.
- Intercept the anatome request and force it to fail → the card gracefully shows
  badges only, no broken-image icon.

A new test must **fail without the change and pass with it**.

## 8. Rollout

Each a reviewable PR to `main` (never draft; labeled per
[`pr-labeling.md`](../.claude/rules/pr-labeling.md)):

1. **This PRD** — `[docs]` (this change) + index row in `prd/README.md`.
2. **`[web][feat]`** — the mapping + URL builder, `MuscleDiagram` component wired
   into the Info tab, the `VITE_ANATOME_BASE_URL` env var + legend tokens, and the
   graceful fallbacks; web unit + e2e tests. Documents the env var in
   `apps/web` config/README and deployment (Dokploy) as a **build-time** arg if it
   must be baked in — same class of gotcha as `VITE_API_BASE_URL`.

No migration, no API change, no feature flag — the change is purely additive to
one card and degrades to today's behavior (text badges) whenever the diagram
can't render.

## 9. Success metrics

- Opening the Info tab for any exercise with a mappable primary muscle shows a
  **dual-view body diagram** with the correct muscles **red (primary)** and
  **amber (secondary)** — driven entirely from already-stored fields, **no new
  storage and no API change**.
- Exercises that can't be diagrammed (`cardio`/`full_body`/`other`) and any
  load failure **fall back cleanly** to the existing badges — the card is never
  broken or empty-looking.
- The image URL is a **pure function** of the exercise's muscle groups (same
  groups → same URL), so caching is effective and the external rate limit is not a
  practical blocker.

## 10. Open questions

1. **Hosted vs. self-host timing.** Ship dev/staging on hosted `api.anatome.dev`
   (50/day + caching) and self-host on Cloudflare Workers before production
   traffic (proposed), or self-host from the very first deploy? *Leaning:
   hosted-then-self-host, since code is identical.*
2. **Default view.** `dual` (front + back) is proposed so posterior muscles show.
   Confirm we don't instead want front-only for push movements (keeps the image
   larger on a phone). *Leaning dual for correctness.*
3. **`back` mapping breadth.** `back` → `upper-back,lower-back,trapezius` colors
   the whole posterior chain. Acceptable, or should `back` map to `upper-back`
   only and reserve `lower-back` for `core`? *Leaning: keep broad; our enum has no
   finer distinction.*
4. **Legend placement.** Inline swatches under the diagram (proposed) vs. relying
   on the existing colored badges as the legend. *Leaning: explicit swatches so
   the color meaning is unambiguous.*
5. **Pre-warming cache.** Worth pre-generating the handful of common muscle
   combos (e.g. into Cloudflare cache/R2), or is per-request browser/CDN caching
   enough? *Leaning: start with request caching, measure.*
