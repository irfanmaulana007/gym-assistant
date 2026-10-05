# PRD 0018 — iOS Mobile App (Parity with the Web UI)

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Implemented |
| Created | 2026-10-02 |
| Updated | 2026-10-05 |
| App | mobile |
| Consumes | [0001 Workout Tracking Foundation](0001-workout-tracking-foundation.md) (client-agnostic API) |
| Mirrors | web features 0003–0017 (screen/behaviour parity) |

## 1. Problem

Gym Assistant ships today as a single client: `apps/web`, a React + Vite
mobile-first app that already **emulates a native iOS look** (dark, single
column, 480px max-width, bottom tab bar, bottom sheets, safe-area insets). The
`apps/api` backend was deliberately built **client-agnostic** (JSON over HTTP,
JWT + refresh-token auth, no web-specific assumptions) precisely so a native
mobile client could reuse the exact same contract (root `CLAUDE.md`;
`apps/api/CLAUDE.md`; [PRD 0001](0001-workout-tracking-foundation.md)).

`apps/mobile` is still a placeholder (`README.md` only, no code). Users who want
the app on their phone must open it in a mobile browser — which means no App
Store presence, no home-screen app with a native splash/icon, no native
push/haptics/biometric-unlock path, and the usual browser-chrome and
PWA-reliability compromises during a workout at the gym.

**Critically, the web app assumes connectivity** — every read and write hits the
API live. But the primary place this app is used is **a gym**, where Wi-Fi is
flaky and cell signal is often dead (basements, concrete, dense buildings). A
user mid-set cannot afford a spinner or a failed `POST` when they log their last
rep. The native app must therefore be **offline-first**: the app is fully usable
with no connection, every logged set is captured locally and durably the instant
it happens, and the data syncs to the server transparently when connectivity
returns — on the same account, visible on web afterward.

**This PRD scopes the first native client: iOS only.** Android is explicitly
deferred to a later PRD; the stack chosen here must keep that door open cheaply.
The goal is **feature and visual parity with the web app** — the same screens,
the same layout, the same navigation model — not a redesign.

### Concrete scenario

A user installs *Gym Assistant* from TestFlight / the App Store, signs in with
the same account they use on the web, and sees the identical four-tab app —
Progress, Workout, History, Profile — with the same dark theme, the same green
primary, the same bottom sheets for forms. They start a Push Day session, log
sets with the "last time to beat" hint, complete it, and the session appears in
their history on **both** web and iOS because both talk to the same API.

## 2. Goals

- **A native iOS app** under `apps/mobile`, installable via TestFlight and
  submittable to the App Store, that a user signs into with their existing
  account and existing data.
- **Offline-first** — a **durable local store is the source of truth** the UI
  reads from and writes to. The entire core workout domain (routines, exercises,
  sessions, logged sets) is **viewable and editable with no connection**; logging
  a set never blocks on the network. Changes are queued and **synced
  transparently** when connectivity returns, so the same account is consistent
  across iOS and web (§4.5).
- **Parity with the web UI** — every top-level screen and flow the web has today
  (see §4.2) exists on iOS with the **same layout, information architecture, and
  navigation model** (bottom tab bar + pushed detail screens + bottom sheets for
  forms). It should read as the same product, not a different app.
- **Reuse the same API contract unchanged** — the iOS app consumes the existing
  `/api/v1` endpoints (§4.4) with the same JWT + transparent-refresh auth. **No
  API changes are required or made by this PRD.**
- **Port the web design system faithfully** — the tokens in
  `apps/web/src/styles.css` (color, spacing, radius, elevation, motion,
  safe-area, 480px column) become a shared native theme so the two clients stay
  visually in lockstep (§4.3).
- **Keep Android cheap later** — pick a stack where an Android build is a
  follow-on PRD, not a rewrite.
- **Honour the repo's native-mobile UX rule** (`.claude/rules/native-mobile-ux.md`)
  natively: tab bar, pushed screens, sheets — never desktop-style popovers, never
  hover-dependent affordances.

### Non-goals

- **No Android app** in this PRD (deferred to a later PRD; the stack keeps it
  cheap).
- **Minimise API/backend changes.** The app consumes the existing `/api/v1`
  contract as-is wherever possible. Offline sync does, however, require the
  create/update endpoints to be **idempotent under client-supplied ids /
  idempotency keys** so a replayed queued mutation can't duplicate data; if the
  API doesn't already guarantee that, it is a small companion `[api]` PRD called
  out as a dependency (§4.5, §6). No other backend changes.
- **No new product features.** This is a port, not a redesign — no screens,
  entities, or flows that the web does not already have. New features continue to
  land web-first and are mirrored to mobile afterward.
- **Offline-first is scoped to the core workout domain.** Routines, exercises,
  sessions, and logged sets are fully offline-capable (read + write). The
  **analytics dashboard / muscle-usage** views are server-derived and shown from
  the last successful fetch when offline (read-only cache, refreshed on
  reconnect), not recomputed on-device. **Account creation / first login and
  avatar image upload require connectivity** (documented online-only paths).
- **Last-write-wins conflict resolution**, not operational-transform / CRDT
  merge. Given data is single-user and logged sets are append-only, LWW with
  server timestamps is sufficient (§4.5); a richer merge engine is out of scope.
- **No web-to-native shared component code** beyond the design *tokens* and the
  API *type* definitions (see §6 — the shared-contract question). We are not
  extracting a cross-platform component library in this PRD.

## 3. Decision — tech stack

**Chosen: bare React Native (no Expo) + TypeScript. The entire UI is React
Native — no SwiftUI / custom native views.** We own the native iOS project
(`ios/`, Xcode) directly.

Rationale, scored against this specific codebase:

- **Maximum reuse of what exists.** The web app is React + TypeScript with
  `@tanstack/react-query` and a hand-rolled typed `fetch` client with transparent
  token refresh (`apps/web/src/api/*`). React Native keeps the same mental model
  and lets us port the API client, auth/refresh logic, TypeScript domain types
  (`apps/web/src/types`), and the design tokens (→ a typed theme consumed by RN
  `StyleSheet`) with minimal change.
- **One implementation per screen, one mental model.** Everything is TypeScript/RN
  — no JS↔Swift bridge to build or keep in sync, and no second UI paradigm for
  the team to maintain. The design system and native-feel primitives (bottom
  tabs, sheets, segmented controls) map 1:1 onto RN; the two muscle **diagrams**
  and the **charts** render with **`react-native-svg`**, reusing the web's
  geometry/data math and the same token hexes (§4.2) so they stay single-source
  with web and portable to Android.
- **Offline-first is well-trodden on bare RN.** A durable on-device SQLite
  database (**`op-sqlite`** / `react-native-sqlite-storage`) plus a thin sync
  layer (or a library — WatermelonDB, PowerSync, RxDB) gives us the local source
  of truth and background sync this PRD requires (§4.5).
- **Android later is a port, not a rewrite.** The whole RN UI and all TS logic
  carry over — there are no iOS-only screens to re-build.
- **Bare (no Expo).** We own the native project and ship via **Fastlane +
  TestFlight**. The cost we accept: we hand-build the build/submit pipeline (Xcode
  toolchain, Apple signing) that Expo's EAS would have given for free.

**Tradeoffs we accept (called out so they're not surprises):**

- **More build/release ownership** than Expo (Fastlane, signing, optional OTA via
  CodePush if wanted) and a required **macOS + Xcode** build environment.
- RN's perf ceiling on heavy custom drawing is below native, but our visuals
  (SVG diagrams, simple charts) are well within what `react-native-svg` handles.

**Alternatives considered (not chosen):**

| Option | Verdict |
|--------|---------|
| **Expo (managed RN)** | With no custom native UI to bridge, Expo would actually cut build/release toil (EAS build/submit, managed modules). We chose bare RN for direct control of the native project and pipeline — a **reasonable thing to revisit** if the Fastlane/signing overhead outweighs that control. |
| **Hybrid RN + SwiftUI** | Earlier consideration (SwiftUI for diagrams/charts/active-session); dropped — the native-fidelity gain didn't justify a **second implementation + a JS↔Swift bridge** to maintain, and `react-native-svg` covers the visuals while keeping them single-source with web/Android. |
| **Pure native SwiftUI** (no RN) | Most native, but **zero reuse** of our React/TS client, types, and tokens, and Android later is a **full separate rewrite**. |
| **Capacitor / WebView wrapper** | Ships the *website* in a shell — violates `.claude/rules/native-mobile-ux.md`, and makes offline-first something to bolt onto a web runtime. Rejected. |

## 4. Design

### 4.1 App placement & structure

The app lives in **`apps/mobile`**, owning its own stack, dependencies, scripts,
and config, and gains its own `README.md` + `CLAUDE.md` (per the existing
`apps/mobile/README.md` plan and the monorepo "stay scoped to one app" rule).
Proposed internal structure mirrors the web's feature-first layout so the two
are navigable the same way:

```
apps/mobile/
  src/
    features/   auth, routines, exercises, sessions, progress, profile (RN screens)
    components/ shared native primitives (Button, Field, Sheet, NavBar, BottomNav, Avatar, Segmented, Switch, Collapsible, MuscleDiagram, …)
    api/        ported typed client + per-domain modules (auth, routines, sessions, catalog, analytics)
    db/         SQLite schema + local repositories (source of truth, §4.5)
    sync/       outbox queue + pull/push sync worker + conflict policy (§4.5)
    types/      domain types mirroring the API contract
    theme/      design tokens ported from web styles.css
    lib/        auth context, secure token storage (Keychain), query client, netinfo
  ios/          native Xcode project (RN-generated; standard native modules only, no custom native UI)
  fastlane/     build / TestFlight / App Store submission lanes
  metro.config.js, package.json, tsconfig.json, …
```

Navigation uses **React Navigation** (native stack + bottom-tab navigator) to
reproduce the web's model exactly.

### 4.2 Screen parity (what we port)

Every web route becomes a native screen with the **same purpose and layout**.
Source of truth is the current web app (`apps/web/src/features/*`, `App.tsx`).

**Tab roots (bottom tab bar — 4 tabs, same as web `BottomNav`):**

| Tab | Web route | Native screen | Content |
|-----|-----------|---------------|---------|
| Progress | `/` | Dashboard | Window selector (Week/Month/3M/All), volume chart, muscle balance, activity calendar, PRs, exercise trends, summary metrics. |
| Workout | `/workout` | Routines list | List of routines; add-routine action (sheet); rows push routine detail. |
| History | `/sessions` | Session history | List of completed sessions (date, duration, muscle groups); row opens session detail. |
| Profile | `/profile` | Profile | Avatar, user stats, muscle-usage heatmap + window control, links to edit profile / change password, logout. |

**Pushed detail screens (native stack, top nav bar with back chevron + centered
title — same as web `NavBar`):**

| Web route | Native screen | Content |
|-----------|---------------|---------|
| `/login`, `/register` | Auth screens (full-screen, no tab bar) | Sign in (identifier + password) / register (display name, username?, email, password); inline field errors. |
| `/routines/:id` | Routine detail | View/edit routine, exercise list, add exercise (picker sheet), reorder, start session. |
| `/sessions/:id` | Active session **and** session summary | Live logging (exercise cards, set checklist, timer, pause/resume/complete/abandon, add ad-hoc catalog exercise) **and** post-complete / reopened-from-history summary. |
| `/exercises/:id/history` | Exercise detail | Segmented Info / Progress / History; muscle diagram; edit exercise (sheet). |
| `/profile/edit` | Edit profile | Username, name, gender, DOB, height/weight (+units), activity level, goal, avatar upload (client-side downscale). |
| `/profile/password` | Change password | Current + new password (confirmed twice). |

**Shared primitives to recreate natively** (behaviour-equivalent to
`apps/web/src/components/*`): `Layout` shell, `NavBar`, `BottomNav`, `Sheet`
(native bottom sheet), `Fab`, `Button`/`Field`/`ErrorText`/`Spinner`,
`Segmented`, `Switch`, `Collapsible`, `Avatar`, `ResumeSessionBanner`,
`MuscleDiagram`, `MuscleUsageDiagram`, icon set.

**Cross-cutting behaviours to preserve:** the **resume-session banner** on tab
screens when a session is active/paused; **forms in bottom sheets** (create/edit
routine, exercise picker multi-step, edit exercise) with the two documented
inline exceptions (full-screen auth, inline in-session set inputs); **segmented
controls** for in-page view switching; **press (`:active`) states, no hover**.

> The two muscle **SVG diagrams** and the three dependency-free **chart widgets**
> (`VolumeChart`, `MuscleBalance`, `ActivityCalendar`) are the highest-effort
> ports (web renders them as SVG/DOM). They render via **`react-native-svg`**,
> reusing the same geometry/data math and the **same token hexes** so the
> primary/secondary and 4-tier usage colors never drift from
> `apps/web/src/lib/muscleDiagram.ts` (the constraint called out in PRDs 0009 /
> 0011).

### 4.3 Design-system port

Port `apps/web/src/styles.css` `:root` tokens into a typed native theme
(`apps/mobile/.../theme`): the full color set (bg/surface/text/primary/danger/
accent/border, muscle + usage scales), spacing scale (`sp-1…sp-12`), radius
scale, elevation shadows, motion durations/easing, the **480px max content
width** (centered column, so it still reads as a phone column on iPad), and
**safe-area insets** (via `react-native-safe-area-context`) replacing the web's
`env(safe-area-inset-*)`. Typography uses the iOS system font (San Francisco),
matching the web's `-apple-system` stack. The theme values must stay in sync with
web; §6 proposes how (shared source vs. mirrored constants).

### 4.4 API contract (consumed unchanged)

The app talks to the same `/api/v1` backend via `VITE_API_BASE_URL`'s native
equivalent (a native build-config value, e.g. `react-native-config` — no
hardcoded URL, per `apps/api/CLAUDE.md` / `apps/web/CLAUDE.md`). All endpoints
already exist; this PRD adds none. The contract the app consumes:

- **Auth** — `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`,
  `GET /auth/me`, `PATCH /auth/me`, `POST /auth/change-password`,
  `POST /auth/refresh`.
- **Routines & exercises** — `GET/POST /routines`, `GET/PATCH/DELETE
  /routines/:id`, `PATCH /routines/reorder`, `POST
  /routines/:id/exercises`, `PATCH/DELETE /exercises/:id`, `PATCH
  /routines/:id/exercises/reorder`, `GET /exercises/:id/history`.
- **Sessions** — `POST /routines/:id/sessions`, `GET /sessions/:id`,
  `GET /sessions?limit=&offset=`, `POST /sessions/:id/{pause,resume,complete,abandon}`,
  `PATCH /session-exercises/:id`, `POST /sessions/:id/exercises` (ad-hoc,
  optional `catalog_exercise_id`), `DELETE /session-exercises/:id`,
  `POST /session-exercises/:id/entries`, `PATCH/DELETE /entries/:id`.
- **Catalog** — `GET /exercise-catalog?search=&muscle_group=`.
- **Analytics** — `GET /analytics/dashboard?window=&tz=`,
  `GET /analytics/muscle-groups?window=&tz=` (send the device IANA timezone).

**Auth handling (ported from `apps/web/src/api/client.ts` + `lib/auth.tsx`):**
`Authorization: Bearer <token>` on every non-anonymous request; **transparent
refresh** on `401` (single in-flight refresh deduped across concurrent 401s,
replay the original request, logout on refresh failure); hydrate the user via
`GET /auth/me` on launch when a token exists. **Difference from web:** tokens are
stored in the iOS **Keychain** (`react-native-keychain`), not `localStorage` —
the one deliberate platform change, because secure storage is the native-correct
home for credentials (and sets up biometric-unlock later). Because the app is
offline-first, these endpoints are **not called directly from screens** — the UI
reads/writes the local store and the **sync layer (§4.5)** is the only thing that
touches the network.

**Idempotency dependency.** For offline writes to be safe to replay, the
create/update endpoints must be **idempotent under a client-supplied id /
idempotency key** (POSTing the same client-generated `id` twice must not create
two rows). If the current API doesn't already accept client ids / keys, a small
companion `[api]` PRD adds that — the one backend dependency this PRD introduces
(§6, Q1).

### 4.5 Offline-first architecture

The defining architectural property of this app. The web reads/writes the API
live; the iOS app instead treats **an on-device database as the source of
truth**, with a background sync layer reconciling it against the server.

**Local store (source of truth).** A durable on-device **SQLite** database
(`op-sqlite` / `react-native-sqlite-storage`) holds the user's full workout domain — routines,
exercises, sessions, session-exercises, and set entries — mirroring the API's
entity shapes (`apps/web/src/types`). **Every screen reads from and writes to the
local DB**, so the UI is instant and fully functional with the radio off. React
Query sits on top as the in-memory cache/subscription layer; the DB is what
persists. Logging a set is a **local, synchronous write** that can never fail for
lack of signal.

**Write path — outbox queue.** Every mutation (create routine, add exercise,
start/complete session, log/edit/delete a set, edit profile, …) is applied
**optimistically to the local DB** and appended as a record to a persisted
**outbox** table: `{ client_id, entity, op, payload, base_version, created_at,
state }`. A sync worker drains the outbox in order whenever the device is online
(reacting to `@react-native-community/netinfo` + app-foreground + a periodic
tick), translating each record into the corresponding `/api/v1` call (§4.4). On
success the record is marked synced; on a retryable/network error it stays queued
with backoff; on a hard `4xx` (validation/conflict) it is flagged for the
conflict policy below. The queue survives app kills (it's in SQLite).

**Id strategy.** Offline creates can't wait for a server id, so the client
**generates the UUID** (`client_id`) at creation time and uses it as the entity's
real id everywhere — local rows, child references, and the create request. This
requires the API to **accept a client-supplied id** (or an idempotency key that
maps to one) so a replay is a no-op rather than a duplicate — the idempotency
dependency in §4.4 / §6. No temp-id→server-id remapping is needed if client ids
are accepted end-to-end.

**Read / pull sync.** On launch, on reconnect, and on pull-to-refresh, the sync
worker **pulls the server state** for the user and reconciles it into the local
DB. Because per-user data is small, **v1 does a full per-entity refetch** of the
existing list/detail endpoints (no new delta API needed) and upserts by id;
server rows absent locally are inserted, and server-confirmed deletions
propagate naturally (a row absent from the server pull that has no pending local
create is removed). A `?since=` delta endpoint + tombstones is a **later
optimisation**, not a v1 requirement — explicitly kept out so this PRD needs no
read-side API change.

**Conflict policy — last-write-wins (LWW).** Single-user data plus append-only
set logs make conflicts rare and low-stakes:

- **Set entries are append-only** — two devices logging sets produce distinct
  rows (distinct client ids); no conflict, both sync.
- **Entity edits** (routine name, exercise targets, profile fields) use **LWW by
  `updated_at`**: when a pull returns a server row newer than the local
  unsynced edit, the server wins and the local edit is dropped (and surfaced in a
  sync log); when the local edit is newer, the outbox push wins. This is a
  deliberate simplification (see non-goals) — no field-level merge / CRDT.
- **Deletes win over concurrent edits** (tombstone semantics on pull).

**Sync status in the UI.** A lightweight, non-blocking indicator shows
pending/synced/offline state (e.g. a subtle marker on the resume-session banner
and a "last synced" line on Profile), so the user trusts that an offline-logged
workout is safe and will upload. No modal, no spinner gate on the logging path.

**Library choice is an open question (§6).** The above is expressible with (a) a
hand-rolled SQLite + outbox layer, (b) **WatermelonDB** (SQLite + built-in sync
protocol), (c) **PowerSync/RxDB** (managed replication), or (d) **React Query
persistence + a mutation-resumption outbox** over SQLite. Recommendation leans to
a **thin hand-rolled outbox over `op-sqlite`** (full control, no new backend
service, matches our simple LWW needs), revisited if it proves heavier than a
library.

### 4.6 Native capabilities (v1 scope)

In scope for v1 because they're table-stakes-native and low-risk: app icon +
splash, secure token storage (above), safe-area + status-bar theming, haptic tap
feedback on primary actions (via an RN haptics module), and pull-to-refresh that
triggers a sync (§4.5). Offline-first itself is a core goal,
not a native "extra" — see §4.5. **Out of scope** (future PRDs): push
notifications, biometric unlock, a `?since=` delta-sync API, Apple Health
integration, and widgets.

## 5. Testing

Per [`.claude/rules/testing.md`](../.claude/rules/testing.md) every change ships
a **unit** test and an **e2e** test under the root `tests/` tree, on dedicated
ports — never the local dev ports. For `apps/mobile` this means establishing the
mobile test lanes (the tree currently resolves `api` and `web`; see the
[testing-setup] memory) alongside the first feature code:

- **Unit** (`tests/unit-test/mobile/`): the ported API client injects the bearer
  token and performs the **single-flight 401 → refresh → replay** correctly; the
  theme exposes the same token values as web; screen/component logic (e.g.
  set-logging reducer, "last time to beat" hint, resume-banner visibility) via
  React Native Testing Library + a mocked API. **Offline/sync is the
  highest-risk logic and gets the most unit coverage**: an outbox mutation
  applies optimistically to the local DB and replays to the right endpoint;
  **replaying the same client-id create twice is idempotent (no duplicate)**; the
  **LWW resolver** keeps the newer side on pull; append-only set entries from two
  "devices" both survive; the worker drains in order and backs off on network
  error. No network, no real backend (SQLite in-memory + mocked API).
- **E2E** (`tests/e2e/mobile/`): drive the built app (**Detox or Maestro**
  against an iOS simulator) through the protected happy path end-to-end against a
  **self-contained API stack on dedicated ports** (reuse the pattern behind
  `tests/cmd/e2eserver` + embedded Postgres that the web e2e already uses — see
  [test-port-isolation] memory): **register/login → create routine → add
  exercise → start session → log a set → complete → see it in history**, i.e. a
  create-and-read round-trip, not one half. **Plus an offline round-trip**: go
  offline (airplane mode / disabled radio) → log a full session → confirm it's
  visible in-app from the local store → go online → assert the sync worker pushes
  it and the **server** (and a second client / the web) now returns those sets.

Each new test must fail without the change and pass with it. CI additionally runs
the app's own `lint` / `typecheck` and a **Fastlane/Xcode build** of the app
binary (macOS runner). The PR lists the tests added and where they live.

> Because this is a brand-new app, the first implementation PR establishes the
> mobile test harness itself; subsequent feature PRs add their unit + e2e tests
> to those lanes. Where a flow genuinely can't be e2e-tested until a dependency
> lands, we say so in the PR and add the e2e guard in the PR that completes it
> (per the testing rule), rather than silently skipping it.

## 6. Open questions (resolve during review)

1. **API idempotency (the one backend dependency).** Do the existing
   create/update endpoints already accept a **client-supplied id** (or an
   `Idempotency-Key`) so a replayed offline mutation can't duplicate a row
   (§4.4, §4.5)? If not, a small companion `[api]` PRD adds it. Recommendation:
   accept the client UUID as the row id on create (the API already uses UUIDs),
   making replays naturally idempotent.
2. **Sync library.** Thin hand-rolled outbox over `op-sqlite` (recommended) vs. a
   library (WatermelonDB / PowerSync / RxDB) vs. React Query persistence + an
   outbox (§4.5). Decide before the sync phase.
3. **Shared code strategy** — do we (a) extract the domain **types** and design
   **tokens** into a shared workspace package both `web` and `mobile` import, or
   (b) mirror them as independent copies per app (simpler, matches today's
   "each app owns its deps" rule but risks drift)? Recommendation: start with
   **(b) mirrored**, and revisit a shared package only if drift becomes real.
   Either way, keep the muscle/usage hexes and token values single-sourced enough
   that the diagrams never drift (the PRD 0009/0011 constraint).
4. **Apple developer account / bundle id / signing** — needed for TestFlight +
   App Store (and the Fastlane lanes); who owns it and what's the bundle
   identifier?

## 7. Rollout

Parity is large, so land it as a **stacked sequence of `[mobile]` PRs**, each
with its unit + e2e tests, roughly bottom-up:

0. **(dependency, if needed)** `[api]` — guarantee **idempotent create/update**
   under client-supplied ids / keys (§6 Q1). Lands before the sync phase.
1. **`[mobile][chore]`** — scaffold **bare React Native** app in `apps/mobile`
   (own `ios/` Xcode project), `README.md` + `CLAUDE.md`, **Fastlane**
   build/submit lanes, mobile test lanes (`tests/unit-test/mobile`,
   `tests/e2e/mobile`) wired to a self-contained API stack on dedicated ports.
2. **`[mobile][feat]`** — design-system/theme port + shared RN primitives (shell,
   nav bar, bottom tab bar, sheet, buttons/fields, segmented, avatar).
3. **`[mobile][feat]`** — API client + auth (Keychain storage, transparent
   refresh) + auth screens + protected navigation (React Navigation).
4. **`[mobile][feat]`** — **offline core**: local SQLite schema + repositories +
   outbox + pull/push **sync worker** + LWW conflict policy + sync-status UI
   (§4.5). Everything after this reads/writes the local store.
5. **`[mobile][feat]`** — Workout tab: routines list + routine detail + exercise
   picker.
6. **`[mobile][feat]`** — Sessions: start/active logging + summary + history tab
   + resume banner (the core offline-logging path).
7. **`[mobile][feat]`** — Exercise detail (Info/Progress/History) + muscle
   diagram (`react-native-svg`).
8. **`[mobile][feat]`** — Progress dashboard (charts) + muscle-balance/usage.
9. **`[mobile][feat]`** — Profile + edit profile + change password + avatar
   upload (online-only path).
10. **`[mobile][chore]`** — icon/splash, Fastlane TestFlight beta, App Store
    submission.

The web app is untouched and there's no feature flag — the app is additive and
ships to its own store track. The **only** possible backend change is the
idempotency guarantee (step 0), a small companion `[api]` PRD. Android becomes a
follow-on PRD: the entire RN UI and TS logic port over, with no iOS-only screens
to re-build.
