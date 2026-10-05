# Mobile e2e (Detox, iOS simulator)

Drives the **built** iOS app through the protected happy path end-to-end against
a **self-contained API stack on dedicated ports** — the same pattern the web e2e
uses (`tests/cmd/e2eserver` + embedded Postgres), parameterized to new ports so
nothing collides with web e2e or local dev (per `.claude/rules/testing.md`).

## Ports (dedicated — never the dev ports)

| Service | Port | Env var |
|---------|------|---------|
| Test API (assembled app) | `8091` | `E2E_API_PORT` |
| Embedded Postgres | `5435` | `E2E_PG_PORT` |

Web e2e uses `8090`/`5434`; local dev uses `8080`/`5432`. This suite uses
`8091`/`5435`.

## Running (macOS + Xcode required)

```bash
# 1. Boot the self-contained test API (embedded Postgres) on the dedicated ports
cd tests && E2E_API_PORT=8091 E2E_PG_PORT=5435 go run ./cmd/e2eserver &

# 2. Build the app pointed at that test API, then run Detox
cd apps/mobile
printf 'API_BASE_URL=http://localhost:8091\n' > .env.e2e
ENVFILE=.env.e2e npm run build:e2e      # detox build (xcodebuild)
npm run test:e2e                         # detox test -c ios.sim.debug
```

## Coverage (`offline-session.e2e.ts`)

1. **Online happy path** (create-and-read round-trip, not one half):
   register/login → create routine → add exercise → start session → log a set →
   complete → see it in History.
2. **Offline round-trip** (the defining PRD 0018 property): disable the radio →
   log a full session → confirm it's visible in-app from the local store → go
   online → assert the sync worker pushes it and the **server** (queried
   directly / from a second client) now returns those sets.

> This suite needs the RN/iOS build toolchain and is run on a macOS + Xcode CI
> runner — it is NOT part of the fast JS logic suite (`npm test`). The offline
> round-trip's sync/LWW/idempotency mechanics are additionally covered as fast
> unit tests in `tests/unit-test/mobile/`.
