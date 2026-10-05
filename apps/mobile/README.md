# Gym Assistant — Mobile (iOS)

A **native iOS app** (bare React Native + TypeScript) with **feature and visual
parity** with `apps/web`, and the one thing the web can't be: **offline-first**.
The on-device SQLite database is the source of truth — every screen reads and
writes it, logging a set never blocks on the network, and a background sync
layer reconciles with the server when connectivity returns. See
[`prd/0018-ios-mobile-app.md`](../../prd/0018-ios-mobile-app.md).

It consumes the same `/api/v1` backend as the web app (JWT + transparent
refresh), with **no API changes** — the one backend dependency is an idempotency
guarantee on creates (see *Backend dependency* below).

## Stack

- **Bare React Native 0.76 + TypeScript** (no Expo) — we own `ios/` + the
  Fastlane/TestFlight pipeline.
- **React Navigation** (native stack + bottom tabs) — same nav model as web.
- **@tanstack/react-query** over a durable **op-sqlite** store (the source of
  truth) + a hand-rolled **outbox + sync worker** (LWW conflict policy).
- **react-native-svg** for the muscle diagrams + charts (single-sourced hexes
  with web, PRD 0009/0011).
- **react-native-keychain** (tokens), **@react-native-community/netinfo**
  (sync trigger), **react-native-config** (env), **react-native-haptic-feedback**.

## Structure

```
src/
  features/   auth, routines, exercises, sessions, progress, profile (RN screens)
  components/ native primitives (Button, Field, Sheet, Segmented, Switch,
              Collapsible, Avatar, Fab, Screen, MuscleDiagram, …)
  api/        ported typed client + per-domain modules (auth/routines/sessions/catalog/analytics)
  db/         SQLite schema + driver + repositories (local source of truth, §4.5)
  sync/       outbox drain + pull/reconcile worker + LWW resolver + idempotent push mapper
  types/      domain types mirroring the API contract (copied from web)
  theme/      design tokens ported from apps/web/src/styles.css + shared StyleSheet
  lib/        auth context, Keychain token store, NetInfo, haptics, query client, sync provider
  navigation/ root stack + bottom-tab navigators
ios/          native Xcode project — GENERATED (see below), not committed by this PR
fastlane/     build / TestFlight / App Store lanes
```

## Prerequisites

macOS + **Xcode**, **Node ≥ 18**, **CocoaPods** (`bundle install`), and
**Watchman** (recommended). For e2e: **Detox** + `applesimutils`.

## Generating the iOS project

This PR ships all the JS/TS source, config, and the Fastlane/Detox pipeline, but
**not** the generated `ios/` Xcode project (it's large, machine-generated, and
best produced on the build machine). Generate it once:

```bash
cd apps/mobile
npm install
# Scaffold the native iOS project for this app (RN community CLI):
npx @react-native-community/cli@15 init GymAssistant \
  --version 0.76.5 --directory .tmp-rn --skip-install --pm npm
# Copy the generated ios/ into place, then wire the native modules:
mv .tmp-rn/ios ./ios && rm -rf .tmp-rn
bundle install && bundle exec pod install --project-directory=ios
```

Then set the bundle id + display name (`Gym Assistant`), app icon, and launch
screen. (Bundle id / Apple account ownership is PRD 0018 §6 Q4.)

## Running

```bash
cp .env.example .env         # API_BASE_URL + ANATOME_BASE_URL (no hardcoded URL)
npm start                    # Metro
npm run ios                  # build + run on a simulator
```

## Testing

Per [`.claude/rules/testing.md`](../../.claude/rules/testing.md), every change
ships a unit test **and** an e2e test under the repo-root `tests/` tree.

| Command | What | Needs |
|---------|------|-------|
| `npm test` | **Vitest** logic suite — the offline/sync engine, API refresh, theme parity, pure helpers (`tests/unit-test/mobile/*.test.ts`). The highest-risk logic (§5). | Node only |
| `npm run test:native` | **RNTL** component tests (`tests/unit-test/mobile/*.native.test.tsx`). | RN Jest preset |
| `npm run test:e2e` | **Detox** iOS-simulator e2e incl. the offline round-trip (`tests/e2e/mobile/`). | macOS + Xcode + applesimutils |

The Vitest suite runs anywhere and is green in CI without a simulator; the
component + e2e suites run on a macOS + Xcode runner (see
`tests/e2e/mobile/README.md` for the dedicated-port API stack).

## Build & release

Fastlane lanes (`bundle exec fastlane <lane>`): `bootstrap`, `build_sim`,
`test`, `beta` (TestFlight), `release` (App Store). See `fastlane/README.md`.

## Offline-first (how it works)

- **Source of truth:** `src/db` (op-sqlite). `src/db/repositories.ts` applies
  every mutation optimistically to the local DB and appends an **outbox** record.
- **Sync:** `src/sync/worker.ts` drains the outbox in order (idempotent replays
  via client-supplied ids), then pulls the server snapshot and reconciles it by
  id with **last-write-wins** (`src/sync/resolve.ts`). Triggered by NetInfo
  reconnect, app-foreground, a periodic tick, and pull-to-refresh.
- **Online-only paths** (documented non-goals): account creation / first login,
  avatar upload, and the analytics dashboard (shown from the last cached fetch
  offline, read-only).

## Backend dependency (PRD 0018 §6 Q1)

Offline replays are safe only if the create/update endpoints are **idempotent
under a client-supplied id** (POSTing the same client UUID twice must not create
two rows). The client generates UUIDs and sends them on create; session start
additionally sends its client-id'd exercise snapshot. If the current API doesn't
already accept client ids, that is the small companion `[api]` change this app
depends on. The push mapper also treats `409` on create / `404` on delete as
idempotent success.

## Known v1 simplifications

- **Pull is a full per-entity refetch** (no `?since=` delta yet); sessions are
  pulled as a bounded page, so the tombstone pass only reconciles within the
  fetched set (a `?since=` + server tombstones is the deferred optimization).
- Conflict resolution is **LWW**, not field-level merge (per the PRD non-goal).
