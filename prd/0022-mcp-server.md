# PRD 0022 — Read-Only MCP Server for Workout Data

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Approved |
| Created | 2026-11-04 |
| Updated | 2026-11-04 |
| App | mcp |
| Related PRs | #79 |

> Note: this PRD was written alongside the initial implementation rather than
> strictly before it. It is retained as the design record for `apps/mcp` and to
> satisfy `.claude/rules/prd-documents.md`; future changes to the MCP server
> follow the normal PRD-first order.

## Problem

The user wants their AI agent (Claude Code, or any MCP client) to answer
questions grounded in their real training history — "what did my last leg day
look like?", "show my bench-press progression over 90 days" — without exporting
data by hand or hand-writing SQL against the database. The data already lives
behind the `apps/api` HTTP API, scoped per user by JWT; what is missing is a
typed, discoverable surface an agent can call.

## Goals

- Expose the user's **own** profile and workout history to an MCP client as a
  small set of well-described tools.
- **Read-only**: never create, update, or delete anything. The server is a lens
  over existing data, not a second write path.
- Reuse the existing API contract and its per-user scoping — no direct database
  access, no new endpoints, no new domain entities.
- Config from the environment only; no hardcoded secrets.

## Non-goals

- Any write/mutation capability (logging sets, creating routines, etc.).
- Multi-user / impersonation. The server only ever sees the one authenticated
  user behind the configured credential.
- A new product feature in `apps/web` or `apps/api`. This is developer-facing
  tooling.

## Design

A new app, **`apps/mcp`** — TypeScript + `@modelcontextprotocol/sdk`, stdio
transport — added to the root npm workspace so the shared `tests/` tree resolves
its deps (per `.claude/rules/testing.md`).

### Surface (14 read-only tools)

Each tool maps 1:1 to a GET endpoint and is declared in one `TOOLS` table
(`src/tools.ts`), auto-registered by `src/server.ts`:

- `get_profile` → `/auth/me`
- `list_routines` / `get_routine` → `/routines`, `/routines/{id}`
- `get_exercise_history` → `/exercises/{id}/history`
- `search_exercise_catalog` → `/exercise-catalog`
- `list_sessions` / `get_session` → `/sessions`, `/sessions/{id}`
- `get_analytics_*` (dashboard, summary, volume, muscle-groups, consistency,
  records, exercise-trends) → `/analytics/*`

ID arguments are validated as UUIDs and URL-encoded before interpolation;
`muscle_group` is constrained to the API enum. The client only ever issues GET
requests.

### Auth model

`GymApiClient` acquires a JWT lazily and attaches `Authorization: Bearer`:

- **Login** (`GYM_API_IDENTIFIER`/`GYM_API_EMAIL` + `GYM_API_PASSWORD`) —
  recommended; the server rotates tokens internally for its lifetime.
- **Static access token** (`GYM_API_TOKEN`) — used as-is, no auto-renew.
- A raw refresh token is **not** accepted as a startup credential: the API
  single-uses/rotates refresh tokens (PRD 0010), so replaying one each launch
  would trigger reuse-detection and revoke every session the user has.

Token acquisition is **single-flight**: concurrent tool calls that hit a 401
share one in-flight refresh/login, so a single-use refresh token is never
presented twice. Requests carry a timeout (`GYM_API_TIMEOUT_MS`, default 15s);
the base URL must be `https` for any non-local host.

### Distribution

A project-scoped `.mcp.json` (repo root) points Claude Code at the built server
using `${VAR}` expansion, so credentials come from the environment and are never
committed. Defaults to the production API.

## Testing

- **Unit** (`tests/unit-test/mcp`): config resolution (incl. https enforcement),
  single-flight refresh on concurrent 401s, refresh→login fallback,
  static-token-rejection message, timeout/network error mapping, and a
  table-driven check of every tool's path/query + UUID/enum validation.
- **E2E** (`tests/e2e/mcp`): spins up a mock API on an ephemeral port and drives
  the real server over stdio via an MCP client (tool listing, profile read with
  bearer forwarding, full session read, API-404 → tool error). Never touches
  production or a dev port.

## Rollout

Ship `apps/mcp` behind the committed `.mcp.json`; the user builds once
(`npm --workspace apps/mcp run build`) and exports credentials. No API or web
changes, no migration.
