# Testing

**Every code change ships with tests — a unit test _and_ an end-to-end test.**
This is mandatory, not optional. A change that adds or modifies behavior without
both is incomplete and must not be merged.

This rule complements [`bug-fixing.md`](bug-fixing.md) (reproduce-first for bugs)
and each app's "verify before done" checklist. Bug fixes still follow RED → fix →
GREEN; this rule additionally requires the resulting tests to live in the shared
`tests/` tree so coverage is discoverable in one place.

## Where tests live

All tests live under the root [`tests/`](../../tests/) directory, already split:

```
tests/
├── unit-test/   # fast, isolated tests of a single unit (function, service, component)
└── e2e/         # end-to-end tests exercising a full user-facing flow
```

- **`tests/unit-test/`** — one focused test per unit of behavior added or changed:
  a service/validation rule (`apps/api`), a hook/component/util (`apps/web`).
  No network, no real database — mock or use in-memory fakes. Fast.
- **`tests/e2e/`** — at least one test covering the change from the outside in:
  an HTTP round-trip against the API (create **and** read back), or a UI path in
  the web app. Verifies the whole data flow, not one half.

Organize by app inside each directory (e.g. `tests/unit-test/api/…`,
`tests/e2e/web/…`) so it is obvious what each test covers.

## What "every code change" means

| Change | Unit test | E2E test |
|--------|-----------|----------|
| New feature / endpoint / screen | Yes — the new logic | Yes — the new user-facing flow |
| Behavior change to existing code | Yes — updated/added | Yes — the affected flow |
| Bug fix | Yes — a RED→GREEN regression test | Yes — if the bug crossed a full flow |
| Pure docs / comments / formatting | Not required | Not required |
| Config / tooling with no behavior change | Not required | Not required |

When a change genuinely cannot be end-to-end tested yet (e.g. a dependency the
flow needs does not exist), say so explicitly in the PR description and add the
e2e test in the PR that completes the flow — don't silently skip it.

## Never occupy the local dev ports

**Tests must spin up their own servers on dedicated/ephemeral ports — never the
ports a developer uses locally (`:5173` web, `:8080` API, `:5432` Postgres).**
A test run must not depend on, reuse, or write into a locally-running dev server
or database. This keeps `npm run test`/`test:e2e` safe to run while the app is
up in another terminal.

- **Go unit + e2e (`apps/api`)** — already isolated: `httptest.NewServer` binds
  an ephemeral port, and the e2e suite boots an embedded PostgreSQL on `:5433`
  (`TestMain`). Nothing touches `:8080`/`:5432`.
- **Web unit (`apps/web`, Vitest)** — jsdom, no server. Nothing to isolate.
- **Web e2e (`apps/web`, Playwright)** — the config starts BOTH a dedicated Vite
  server (`:4173`, `reuseExistingServer: false`) and a fully self-contained API
  stack — the assembled API plus an ephemeral embedded PostgreSQL on `:5434`,
  launched by [`tests/cmd/e2eserver`](../../tests/cmd/e2eserver) on `:8090`. The
  browser talks to the test API via `VITE_API_BASE_URL`; ports are overridable
  via `WEB_PORT` / `E2E_API_PORT`. The local `:5173`/`:8080` are never used.

## Verify before done

- Both the new unit test(s) and e2e test(s) **pass** locally before opening a PR.
- The relevant app's `lint`, `typecheck`/`vet`, and `build` still pass.
- A new test must **fail without the change** and **pass with it** — a test that
  passes either way guards nothing.

## PR expectations

- The PR description lists the tests added and where they live.
- Reviewers may reject a code PR that ships without the matching unit + e2e tests.
- See [`git-workflow.md`](git-workflow.md) for commit/PR title format and
  [`pr-labeling.md`](pr-labeling.md) for the label (test-only PRs use `test` →
  `Chore`).
