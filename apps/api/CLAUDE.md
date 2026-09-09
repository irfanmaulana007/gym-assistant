# CLAUDE.md — API (`apps/api`)

Go + PostgreSQL backend. Read this together with the root
[`CLAUDE.md`](../../CLAUDE.md) and [PRD 0001](../../prd/0001-workout-tracking-foundation.md).

## Architecture

Layered, dependencies point inward:

```
handler  →  service  →  repository  →  PostgreSQL
   ▲            ▲
 middleware   domain (entities: User, Routine, Exercise, WorkoutSession, SetLog)
```

- **handler** — HTTP only: decode/validate request, call a service, encode
  response + errors. No business logic, no SQL.
- **service** — business rules, incl. **derived** progression (top set, volume,
  trend) computed from `SetLog` rows. No HTTP, no raw SQL.
- **repository** — data access with **parameterized queries** only.
- **domain** — plain entities/value types shared across layers.
- **middleware** — auth (JWT → user), request scoping, logging.

## Non-negotiables

- **Scope every query to the authenticated `user_id`.** A client never sends a
  `user_id`; it comes from the verified token. No cross-user access by guessing
  an ID.
- **Secrets from env/config only** — never hardcode. Keep `.env.example` current.
- **Schema changes go through `migrations/`** (ordered SQL). Commit scope
  `[migration]`.
- **Progressive overload is derived**, never stored — don't add denormalized
  trend columns.
- **API is client-agnostic** — no web-specific assumptions in responses; the
  mobile app must be able to consume the same endpoints.

## Conventions

- Responses: JSON under `/api/v1`; error envelope
  `{ "error": { "code", "message", "details" } }`; RFC 3339 UTC timestamps; UUID
  ids.
- Commit scope for backend changes: `[api]` (e.g. `[api][feat] Add routines endpoint`).

## Verify before done

Run the module's `go fmt`/`gofmt`, `go vet`, `go build ./...`, and tests. For
bugs: write a failing test first, then fix (repo rule `bug-fixing.md`). Integration
tests should hit a real Postgres and assert the full create→read round-trip.
