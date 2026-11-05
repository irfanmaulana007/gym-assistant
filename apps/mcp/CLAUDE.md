# apps/mcp — Gym Assistant MCP server

Read-only MCP server (TypeScript + `@modelcontextprotocol/sdk`) that exposes
the user's profile and workout history to MCP clients by calling the `apps/api`
HTTP API with a JWT. Two transports share one tool server (`createServer`):

- **stdio** (`src/index.ts`) — local Claude Code, credentials from env.
- **Streamable HTTP + OAuth** (`src/http-main.ts` → `src/http.ts`,
  `src/oauth/*`) — remote connector; each request runs as the user who signed
  in. See [PRD 0023](../../prd/0023-remote-mcp-oauth.md).

See [`README.md`](README.md) for the tool list and setup.

## Conventions for this app

- **Read-only, always.** Tools only ever issue GET requests via
  `GymApiClient.get()`. Do not add write/mutation tools here — this server is a
  lens over existing data, not a second write path. New product capabilities go
  through `apps/api` (and a PRD) first.
- **Config from env only** (`src/config.ts`) — no hardcoded secrets, no baked-in
  credentials. Base URL defaults to production and must be `https` for any
  non-local host; requests carry a timeout (`GYM_API_TIMEOUT_MS`).
- **Add a tool** by appending a `ToolDef` to the `TOOLS` table in
  `src/tools.ts` (name, title, description, zod `inputSchema`, and a `request()`
  that returns the API path + query). `server.ts` registers the whole table
  automatically — no per-tool wiring.
- **Never write to stdout** — it is the MCP transport. Diagnostics go to stderr.
- **Auth lives in `GymApiClient`** — it resolves a token lazily and retries once
  on a 401 (refresh, else re-login). Token acquisition is **single-flight**
  (concurrent 401s share one in-flight refresh) so a single-use refresh token is
  never replayed — replaying one makes the API revoke every session. A raw
  refresh token is never accepted from the environment for the same reason. Keep
  that the single place auth happens **for tool calls**.
- **Remote-mode OAuth lives in `src/oauth/`.** `GymOAuthProvider` is the only
  place that logs in / refreshes / logs out on a user's behalf (via `ApiAuth`).
  Everything it issues is sealed by `Sealer` (`MCP_OAUTH_SECRET`) — keep it
  stateless (no DB, no files); each sealed payload has a purpose that must be
  checked on open. Never log tokens or passwords. The login page is
  script-free and every interpolation goes through `escapeHtml`.

## Checks before done

```bash
npm --workspace apps/mcp run lint
npm --workspace apps/mcp run typecheck
npm --workspace apps/mcp run build
npm --workspace apps/mcp run test
```

Tests live in the repo-root `tests/` tree (`tests/unit-test/mcp`,
`tests/e2e/mcp`) per `.claude/rules/testing.md`, run by this app's
`vitest.config.ts`. They must never hit production or a local dev port — the
e2e test starts its own mock API on an ephemeral port.
