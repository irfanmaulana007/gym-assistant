# PRD 0018 — iOS Mobile App (Parity with the Web UI)

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Draft |
| Created | 2026-10-02 |
| Updated | 2026-10-02 |
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
- **No API/backend changes.** If a parity gap needs a new endpoint, that is a
  separate `[api]` PRD; this PRD consumes the contract as-is.
- **No new product features.** This is a port, not a redesign — no screens,
  entities, or flows that the web does not already have. New features continue to
  land web-first and are mirrored to mobile afterward.
- **No offline-first / local-write sync engine.** v1 is online, reading and
  writing live against the API like the web does today (standard query-cache
  freshness only). An offline workout-logging mode is a future PRD.
- **No web-to-native shared component code** beyond the design *tokens* and the
  API *type* definitions (see §6 — the shared-contract question). We are not
  extracting a cross-platform component library in this PRD.

## 3. Decision — tech stack (needs approval)

This is the load-bearing decision of the PRD and the main thing to sign off on.

**Recommendation: Expo (React Native) + TypeScript.**

Rationale, scored against this specific codebase:

- **Maximises reuse of what exists.** The web app is React + TypeScript with
  `@tanstack/react-query` for server state and a hand-rolled typed `fetch`
  client with transparent token refresh (`apps/web/src/api/*`). React Native
  keeps the same mental model, the same React Query data layer, and lets us port
  the API client, the auth/refresh logic, and the TypeScript domain types
  (`apps/web/src/types`) with minimal change.
- **The design system ports directly.** Our tokens are plain values (hex,
  px, cubic-bezier) with no web-only magic; they become a typed theme object
  consumed by RN `StyleSheet`. The visual language (dark, single column, bottom
  tabs, sheets) maps 1:1 onto RN primitives and libraries we'd use anyway.
- **Android is a build target, not a rewrite** — satisfies the "cheap later"
  goal better than any native-only path.
- **Expo specifically** gives us EAS Build/Submit (CI builds + TestFlight/App
  Store submission without a Mac build farm), OTA-capable updates, and
  first-class modules for the native capabilities we want next (push,
  haptics, secure storage, biometric unlock).

**Alternatives considered (and why not, for v1):**

| Option | Verdict |
|--------|---------|
| **Native SwiftUI** | Most "native" and best raw performance, but **zero reuse** of our React/TS API client, types, and token system; every web feature must be re-implemented twice (now + each future web feature), and it slams the door on cheap Android. Rejected for a parity port. |
| **Capacitor / WebView wrapper** around the existing web app | Fastest to "an app in the store", but it ships the *website* in a shell — not a native app — which **violates the spirit of `.claude/rules/native-mobile-ux.md`** and gives up native push/haptics/biometrics and store-review predictability. Good enough for a PWA; not what "build the mobile app" means here. Rejected. |
| **Bare React Native (no Expo)** | Same reuse benefits as Expo but we hand-build the build/submit/update pipeline and native module glue. Expo removes that toil with an escape hatch (prebuild/dev-client) if we ever need custom native code. Rejected in favour of Expo. |

> If the reviewer prefers a different stack, that choice changes §4 and §5
> substantially — so this is the decision to settle before implementation starts.

## 4. Design

### 4.1 App placement & structure

The app lives in **`apps/mobile`**, owning its own stack, dependencies, scripts,
and config, and gains its own `README.md` + `CLAUDE.md` (per the existing
`apps/mobile/README.md` plan and the monorepo "stay scoped to one app" rule).
Proposed internal structure mirrors the web's feature-first layout so the two
are navigable the same way:

```
apps/mobile/
  app/ or src/
    features/   auth, routines, exercises, sessions, progress, profile
    components/ shared native primitives (Button, Field, Sheet, NavBar, BottomNav, Avatar, Segmented, Switch, Collapsible, MuscleDiagram, …)
    api/        ported typed client + per-domain modules (auth, routines, sessions, catalog, analytics)
    types/      domain types mirroring the API contract
    theme/      design tokens ported from web styles.css
    lib/        auth context, secure token storage, query client
  app.json / eas.json   Expo + build/submit config
```

Navigation uses a native stack + bottom-tab navigator (e.g. Expo Router or React
Navigation) to reproduce the web's model exactly.

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
> ports (web renders them as SVG/DOM). They render via `react-native-svg`,
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
equivalent (an Expo env/config value — no hardcoded URL, per
`apps/api/CLAUDE.md` / `apps/web/CLAUDE.md`). All endpoints already exist; this
PRD adds none. The contract the app consumes:

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
stored in the iOS **Keychain / Expo SecureStore**, not `localStorage` — the one
deliberate platform change, because secure storage is the native-correct home for
credentials (and sets up biometric-unlock later).

### 4.5 Native capabilities (v1 scope)

In scope for v1 because they're table-stakes-native and low-risk: app icon +
splash, secure token storage (above), safe-area + status-bar theming, haptic tap
feedback on primary actions, pull-to-refresh on list/dashboard screens. **Out of
scope** (future PRDs): push notifications, biometric unlock, offline logging,
Apple Health integration, widgets.

## 5. Testing

Per [`.claude/rules/testing.md`](../.claude/rules/testing.md) every change ships
a **unit** test and an **e2e** test under the root `tests/` tree, on dedicated
ports — never the local dev ports. For `apps/mobile` this means establishing the
mobile test lanes (the tree currently resolves `api` and `web`; see the
[testing-setup] memory) alongside the first feature code:

- **Unit** (`tests/unit-test/mobile/`): the ported API client injects the bearer
  token and performs the **single-flight 401 → refresh → replay** correctly
  (the highest-risk ported logic); the theme exposes the same token values as
  web; screen/component logic (e.g. set-logging reducer, "last time to beat"
  hint, resume-banner visibility) via React Native Testing Library + a mocked
  API. No network, no real backend.
- **E2E** (`tests/e2e/mobile/`): drive the built app (Expo/Detox or Maestro
  against an iOS simulator) through the protected happy path end-to-end against a
  **self-contained API stack on dedicated ports** (reuse the pattern behind
  `tests/cmd/e2eserver` + embedded Postgres that the web e2e already uses — see
  [test-port-isolation] memory): **register/login → create routine → add
  exercise → start session → log a set → complete → see it in history**, i.e. a
  create-and-read round-trip, not one half.

Each new test must fail without the change and pass with it. CI additionally runs
the app's own `lint` / `typecheck` / `build` (EAS build in CI for the app
binary). The PR lists the tests added and where they live.

> Because this is a brand-new app, the first implementation PR establishes the
> mobile test harness itself; subsequent feature PRs add their unit + e2e tests
> to those lanes. Where a flow genuinely can't be e2e-tested until a dependency
> lands, we say so in the PR and add the e2e guard in the PR that completes it
> (per the testing rule), rather than silently skipping it.

## 6. Open questions (resolve during review)

1. **Navigation library** — Expo Router (file-based, closest to the web's
   route-centric model) vs. React Navigation (imperative). Recommendation: Expo
   Router.
2. **Shared code strategy** — do we (a) extract the domain **types** and design
   **tokens** into a shared workspace package both `web` and `mobile` import, or
   (b) mirror them as independent copies per app (simpler, matches today's
   "each app owns its deps" rule but risks drift)? Recommendation: start with
   **(b) mirrored** to keep apps independent, and revisit a shared package only
   if drift becomes real. Either way, keep the muscle/usage hexes and token
   values single-sourced enough that the diagrams never drift (the PRD 0009/0011
   constraint).
3. **Apple developer account / bundle id / signing** — needed for TestFlight +
   App Store; who owns it and what's the bundle identifier?

## 7. Rollout

Parity is large, so land it as a **stacked sequence of `[mobile]` PRs**, each
with its unit + e2e tests, roughly bottom-up:

1. **`[mobile][chore]`** — scaffold Expo app in `apps/mobile`, `README.md` +
   `CLAUDE.md`, EAS build/submit config, mobile test lanes
   (`tests/unit-test/mobile`, `tests/e2e/mobile`) wired to a self-contained API
   stack on dedicated ports.
2. **`[mobile][feat]`** — design-system/theme port + shared primitives (shell,
   nav bar, bottom tab bar, sheet, buttons/fields, segmented, avatar).
3. **`[mobile][feat]`** — API client + auth (secure storage, transparent
   refresh) + auth screens + protected navigation.
4. **`[mobile][feat]`** — Workout tab: routines list + routine detail + exercise
   picker.
5. **`[mobile][feat]`** — Sessions: start/active logging + summary + history tab
   + resume banner.
6. **`[mobile][feat]`** — Exercise detail (Info/Progress/History) + muscle
   diagram.
7. **`[mobile][feat]`** — Progress dashboard (charts) + muscle-balance/usage.
8. **`[mobile][feat]`** — Profile + edit profile + change password + avatar
   upload.
9. **`[mobile][chore]`** — icon/splash, TestFlight beta, App Store submission.

No backend change, no feature flag — the app is additive and ships to its own
store track; the web app is untouched. Android becomes a follow-on PRD built on
the same Expo project.
