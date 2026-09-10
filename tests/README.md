# Tests

All tests for the monorepo live here, split by kind. See the authoritative
[`.claude/rules/testing.md`](../.claude/rules/testing.md) — **every code change
ships with a unit test _and_ an e2e test.**

```
tests/
├── unit-test/   # fast, isolated unit tests (no network, no real DB)
└── e2e/         # end-to-end flows (HTTP round-trips, UI paths)
```

Organize by app inside each directory:

```
tests/unit-test/api/    tests/unit-test/web/
tests/e2e/api/          tests/e2e/web/
```

Each app documents how to run its tests in its own `README.md` / `CLAUDE.md`.

## Test servers use dedicated ports (never local dev ports)

Test runs spin up their own servers and never reuse or write into the local dev
stack (`:5173` web, `:8080` API, `:5432` Postgres) — see
[`.claude/rules/testing.md`](../.claude/rules/testing.md). The web e2e stack in
particular is self-contained:

```
tests/cmd/e2eserver/   # boots the assembled API + an ephemeral embedded
                       # PostgreSQL on their own ports, for apps/web Playwright.
```

`apps/web`'s `playwright.config.ts` launches `tests/cmd/e2eserver` (API on
`:8090`, Postgres on `:5434`) and a dedicated Vite server on `:4173`, then points
the browser at the test API via `VITE_API_BASE_URL`. Override with `WEB_PORT` /
`E2E_API_PORT` if those ports are taken.
