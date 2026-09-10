# Gym Assistant — API

Backend service for Gym Assistant. A **client-agnostic JSON API** built with
**Go** and **PostgreSQL**, designed so the web app (now) and a native mobile app
(later) share one contract.

> **Status:** foundation in place — Go module, config, DB pool + migration
> runner, initial schema (PRD 0001 + 0002 combined), and health/readiness
> probes. Auth, routines/exercises, and sessions land in subsequent PRs. See
> [`prd/0001`](../../prd/0001-workout-tracking-foundation.md) and
> [`prd/0002`](../../prd/0002-session-lifecycle-and-metrics.md).

## Running locally

```bash
cp .env.example .env            # fill in DATABASE_URL and JWT_SECRET
make run                        # applies migrations, then serves on $PORT
make dev                        # like run, but hot-reloads on change (air)
make migrate                    # apply migrations only, then exit (idempotent)

# health checks
curl localhost:8080/healthz     # liveness
curl localhost:8080/readyz      # readiness (pings the database)
```

`make dev` and `make migrate` auto-load `.env` if present. `make dev` uses
[air](https://github.com/air-verse/air) and installs it on first use if it is
not already on your `PATH`.

Tests live in the repo-root [`tests/`](../../tests) module (per
`.claude/rules/testing.md`): unit tests under `tests/unit-test/api`, black-box
e2e under `tests/e2e/api`. DB-backed e2e tests run when `TEST_DATABASE_URL` is
set and skip otherwise:

```bash
cd ../../tests
go test ./unit-test/...
TEST_DATABASE_URL="postgres://…" go test ./e2e/...
```

## Tech

- **Language:** Go
- **Database:** PostgreSQL (SQL migrations under `migrations/`)
- **Transport:** JSON over HTTP, versioned under `/api/v1`
- **Auth:** JWT bearer tokens

## Intended structure

```
apps/api/
├── cmd/
│   └── server/          # main entrypoint (wires config, db, router)
├── internal/
│   ├── config/          # env/config loading
│   ├── database/        # connection pool, migration runner
│   ├── domain/          # core entities (User, Routine, Exercise, Session, SetLog)
│   ├── repository/      # data access (parameterized queries)
│   ├── service/         # business logic (incl. derived progression)
│   ├── handler/         # HTTP handlers
│   ├── middleware/      # auth, logging, request scoping
│   └── router/          # route registration
├── migrations/          # ordered SQL migrations
├── go.mod               # (added when the API is scaffolded)
└── .env.example         # (added when the API is scaffolded)
```

The layering is **handler → service → repository**, with `domain` holding the
entities. Every query is scoped to the authenticated `user_id`.

## API surface (Phase 1)

Auth (`/auth/register`, `/auth/login`, `/auth/me`), routines + exercises CRUD and
reorder, workout sessions + set logs, and a derived
`GET /exercises/{id}/history` for progressive-overload monitoring. Full table in
the [PRD](../../prd/0001-workout-tracking-foundation.md#7-api-design).

## Conventions

- **Secrets** come from environment / config — never hardcoded. Ship an
  `.env.example` documenting every variable.
- **Migrations** are the only way the schema changes; commits touching them use
  the `[migration]` scope.
- **Validation** on every input; **parameterized queries** only.
- Before considering work done, run the module's format, `go vet`, and tests.
  Reproduce bugs as a failing test first (see repo `.claude/rules/bug-fixing.md`).
