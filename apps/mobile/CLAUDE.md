# CLAUDE.md — apps/mobile

Guidance for working in the **native iOS app** (bare React Native + TypeScript).
Read the root [`CLAUDE.md`](../../CLAUDE.md) and [`prd/0018`](../../prd/0018-ios-mobile-app.md) first.

## What this is

A native iOS client with **feature + visual parity** with `apps/web`, and the
property web can't have: **offline-first**. It consumes the **same `/api/v1`
contract** as web (JWT + transparent refresh) — no API changes. New product
features land **web-first** and are mirrored here afterward (never the reverse).

## The one rule that defines this app: the local store is the source of truth

Every screen reads and writes **the on-device SQLite store** (`src/db`), never
the network directly. Logging a set is a local, synchronous write that cannot
fail for lack of signal. The **sync worker** (`src/sync`) is the *only* thing
that touches the network.

```
screen ──(read)──▶ hooks/useLocalData ──▶ src/db (SQLite, source of truth)
screen ──(write)─▶ useSync().commit(() => repositoryFn(getStore(), …))
                       │                        │
                       │                        ├─ optimistic write to local DB
                       │                        └─ append an OUTBOX record
                       └─ invalidate React Query + nudge the sync worker
src/sync/worker ──▶ drain outbox (push, idempotent) ──▶ pull snapshot ──▶ reconcile (LWW)
```

- **Writes:** `src/db/repositories.ts` — apply optimistically + enqueue an
  outbox record. Always call them through `useSync().commit(...)` so the UI
  refreshes and a sync is triggered. Never call `src/api/*` from a screen.
- **Reads:** the `useLocalData` hooks (React Query over the store).
- **Sync:** `src/sync/worker.ts` drains the outbox in seq order, then pulls +
  reconciles by id with **last-write-wins** (`src/sync/resolve.ts`). The push
  mapper (`src/sync/push.ts`) is idempotent (client ids; `409`-on-create /
  `404`-on-delete = success).
- **IDs:** always `newId()` (`src/db/id.ts`) at creation — the client UUID is
  the row's real id everywhere, so replays don't duplicate.

### Adding a new mutation

1. Add a repository function in `src/db/repositories.ts` (optimistic write +
   `enqueue(...)` an outbox record with the right `entity`/`op`/`payload`).
2. Map that outbox record → the API call in `src/sync/push.ts`.
3. If it's a new entity, add it to the pull snapshot (`src/sync/pull.ts`) + the
   worker's reconcile pass.
4. Unit-test it (see below) — outbox + LWW + idempotency are the highest-risk
   logic and get the most coverage.

## Design system

Port tokens from `apps/web/src/styles.css` into `src/theme` (typed). **Never
inline raw values** — use `color/sp/radius/shadow/layout` + the shared `g`
StyleSheet. The muscle/usage hexes are single-sourced with web and
`src/lib/muscleDiagram.ts` (PRD 0009/0011) — a unit test asserts parity. Honor
[`native-mobile-ux.md`](../../.claude/rules/native-mobile-ux.md): tab bar +
pushed screens + **sheets** (never desktop popovers), ≥44px targets, press
states (no hover).

## Config

No hardcoded URLs — `src/config.ts` reads `react-native-config` (`.env`:
`API_BASE_URL`, `ANATOME_BASE_URL`). Tokens live in the **Keychain**
(`src/lib/tokenStore.ts`), hydrated into memory at launch.

## Testing (every change ships a unit test AND an e2e test)

- `npm test` — **Vitest** logic suite (`tests/unit-test/mobile/*.test.ts`): the
  offline/sync engine, API refresh, theme parity, pure helpers. Runs on Node, no
  simulator. **This is where offline/sync/LWW/idempotency are proven.** Keep this
  logic RN-free so it stays here.
- `npm run test:native` — **RNTL** component tests (`*.native.test.tsx`).
- `npm run test:e2e` — **Detox** iOS-simulator e2e incl. the offline round-trip
  (`tests/e2e/mobile/`), against a dedicated-port API stack.

Then `npm run lint` + `npm run typecheck`, and a Fastlane/Xcode build on macOS.

## Backend dependency (PRD 0018 §6 Q1)

Offline replays need the create/update endpoints to be **idempotent under a
client-supplied id**. The client sends its UUID on create; session start sends
its client-id'd exercise snapshot. If the API doesn't already accept client ids,
that is the small companion `[api]` change this app depends on.

## Gotchas

- Don't import native modules (`op-sqlite`, `react-native-keychain`, NetInfo) in
  the RN-free core — they'd break the Vitest suite. The core takes them via
  injection (`driver`, `TokenStore`, `isOnline`); only `src/lib/*` and
  `src/db/driver.native.ts` touch the native modules.
- `ios/` is generated on the build machine (see README) — not committed here.
