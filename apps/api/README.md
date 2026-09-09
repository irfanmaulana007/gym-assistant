# Gym Assistant — API

Backend service for Gym Assistant. A **client-agnostic JSON API** built with
**Go** and **PostgreSQL**, designed so the web app (now) and a native mobile app
(later) share one contract.

> **Status:** not implemented yet. This directory holds the intended structure
> and conventions; see [`prd/0001`](../../prd/0001-workout-tracking-foundation.md)
> for the endpoints and rollout plan.

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
