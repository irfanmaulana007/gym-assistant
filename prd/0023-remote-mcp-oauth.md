# PRD 0023 — Remote MCP Server (Streamable HTTP + OAuth)

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Draft |
| Created | 2026-11-04 |
| Updated | 2026-11-04 |
| App | mcp |
| Related docs | [PRD 0022](0022-mcp-server.md), [`apps/mcp/README.md`](../apps/mcp/README.md) |

## Problem

The MCP server from PRD 0022 only speaks **stdio**, so it can only run as a
child process of a local client (Claude Code on a laptop) that holds the
user's password in its environment. It cannot be used from Claude on the web,
desktop, mobile, or a cloud session, where tools are added as a **remote
connector**: a public HTTPS URL that the client reaches over the MCP
Streamable HTTP transport and authorizes with OAuth.

## Goals

- Serve the **same 14 read-only tools** over MCP **Streamable HTTP** at a
  public URL (e.g. `https://mcp-gym.irfanmaulana007.com/mcp`) so it can be
  added as a custom connector in Claude.
- Authorize with **OAuth 2.1** as the MCP authorization spec expects:
  protected-resource + authorization-server metadata, **dynamic client
  registration**, authorization code + **PKCE (S256)**, refresh tokens. The
  user signs in with their **own Gym Assistant account** on a login page the
  MCP server renders. No password is stored in the deployment.
- Multi-user by construction: every request is scoped to the user who
  authorized it, because it carries that user's API JWT.
- Keep stdio mode working exactly as before (`.mcp.json`, Claude Code).
- Read-only stays absolute: still GET-only via `GymApiClient.get()`.

## Non-goals

- Write tools of any kind.
- Changes to `apps/api` (no new endpoints, no schema change). The MCP server
  stays an API client and never touches the database.
- Third-party identity providers, consent screens beyond the login form,
  fine-grained scopes.
- Persistent token storage (see "Stateless tokens").

## Design

### Two entrypoints, one tool server

- `src/index.ts` — stdio, unchanged.
- `src/http-main.ts` — new HTTP entrypoint (`npm run start:http`), built
  from `src/http.ts → createHttpApp(config)` (Express, already a transitive
  dependency of the MCP SDK; now declared explicitly).

`createServer()` (tool registration) is reused as-is. In HTTP mode each
`POST /mcp` request runs in **stateless** Streamable HTTP mode (no MCP session
id, JSON responses): a fresh `McpServer` + `GymApiClient` is built for that
request with the caller's API access token. `GET`/`DELETE /mcp` return 405.

### OAuth: the MCP server is its own authorization server

Implemented with the SDK's `mcpAuthRouter` + `requireBearerAuth` and a custom
`OAuthServerProvider` (`src/oauth/provider.ts`). Endpoints (SDK-provided unless
noted):

| Endpoint | Purpose |
|----------|---------|
| `/.well-known/oauth-protected-resource/mcp` | RFC 9728 resource metadata |
| `/.well-known/oauth-authorization-server` | RFC 8414 AS metadata |
| `POST /register` | Dynamic client registration (RFC 7591) |
| `GET /authorize` | Validates client/redirect/PKCE, then renders the login page |
| `POST /oauth/login` (custom) | Login form submit → API `POST /auth/login` → redirect with `code` |
| `POST /token` | `authorization_code` (PKCE verified locally) and `refresh_token` grants |

Flow: Claude registers → opens `/authorize` → user enters their Gym Assistant
username/email + password → the MCP server calls the API's existing
`/auth/login` → on success it redirects back to Claude's `redirect_uri` with
a one-time code → Claude exchanges it at `/token`.

### Stateless tokens (sealed, not stored)

Nothing is persisted, so a redeploy/restart does not break existing
connectors. Every artifact is an **AES-256-GCM sealed blob** keyed from
`MCP_OAUTH_SECRET` (HKDF), tagged with its purpose so one kind can never be
replayed as another:

| Artifact | Sealed contents | TTL |
|----------|-----------------|-----|
| `client_id` | client metadata (redirect URIs, name, auth method) | none |
| `client_secret` | HMAC of `client_id` (confidential clients only) | none |
| login-form state | client id, redirect URI, PKCE challenge, state, resource | 10 min |
| authorization code | client id, redirect URI, challenge, resource, API access + refresh tokens, `jti` | 5 min, single-use (in-memory `jti` set) |
| access token | API access JWT, client id, resource | = the API JWT's `exp` |
| refresh token | API refresh token, client id, resource | 30 days |

- The API JWT is never handed to Claude in the clear — Claude only ever sees
  opaque tokens that are useless against the API directly and bound to this
  MCP server's resource URL (audience check via `expectedResource`).
- Refresh: unseal → API `POST /auth/refresh` (which rotates the API refresh
  token) → seal the new pair. Bound to the client that obtained it. Each refresh
  token carries a `jti`; the embedded API token is forwarded to the API **at
  most once** per `jti`. A retried or concurrent refresh within a 60 s grace
  window is served the already-rotated pair, and a later replay is rejected
  locally — so a replay never re-sends a spent API token (which would trip the
  API's reuse detection and revoke every session the user has, web app included).
  If the API call fails ambiguously (timeout / 5xx), the `jti` is still marked
  used so a retry forces a reconnect rather than risking a re-forward. The used
  `jti` is remembered only until the sealed token's own expiry.
- Rotating `MCP_OAUTH_SECRET` invalidates all clients and tokens (users simply
  reconnect). This is the revocation lever.
- **Single replica.** The used-`jti` sets for authorization codes and refresh
  tokens are in-memory, so single-use is only guaranteed within one process.
  Deploy the `mcp` service as a single replica (the compose service is not
  scaled); a restart clears the sets, leaving a brief window where an unexpired
  code/refresh token could be redeemed again. Moving the sets to a shared store
  (e.g. Redis) is the follow-up if the service is ever horizontally scaled.

### Hardening

- `MCP_PUBLIC_URL` must be `https` (loopback http allowed for dev/tests);
  `MCP_OAUTH_SECRET` must be ≥ 32 chars and not a `change-me` placeholder.
  Server refuses to start otherwise.
- Consent page shows the client name as **unverified** (it comes from open DCR)
  and the redirect destination the code will be sent to (host, or the full URI
  when there is no host), so a phishing client with a spoofed name is visible to
  the user. Operators can additionally restrict DCR to an exact allowlist via
  `MCP_ALLOWED_REDIRECT_URIS` (unset = accept any); it is enforced on both
  registration *and* every client-id open, so enabling it retroactively disables
  any already-issued client whose redirect URIs are not allowed — no secret
  rotation required.
- Scopes: only `read` is advertised/granted; unknown requested scopes are dropped
  rather than echoed back as granted.
- Login page: `Content-Security-Policy` (no scripts, `form-action 'self'`),
  `X-Frame-Options: DENY`, `Cache-Control: no-store`, HTML-escaped output.
- Rate limits on login (all skip successful attempts): a per-IP backstop
  (20 / 15 min) that runs before body parsing and so returns a plain 429; a
  strict per-`(identifier, IP)` limiter (10 / 15 min) that throttles guessing
  without letting one actor lock a victim out; and a looser account-wide
  per-identifier limiter (50 / 1 h) that bounds distributed guessing across many
  IPs. The two identifier-scoped limiters re-render the sign-in page with a
  friendly 429. SDK defaults cover the other OAuth endpoints.
- `trust proxy` configurable (`MCP_TRUST_PROXY`, default `0`); set it to the real
  hop count only behind a trusted proxy (e.g. Traefik). Defaulting to `0` stops a
  client that reaches the container port directly from spoofing `X-Forwarded-For`
  to rotate the login rate-limit key.
- Never log tokens or passwords.

### Configuration (HTTP mode)

| Var | Required | Default |
|-----|----------|---------|
| `MCP_PUBLIC_URL` | yes | — (e.g. `https://mcp-gym.irfanmaulana007.com`) |
| `MCP_OAUTH_SECRET` | yes | — (`openssl rand -hex 32`) |
| `PORT` | no | `3000` |
| `GYM_API_BASE_URL` | no | production API |
| `GYM_API_TIMEOUT_MS` | no | `15000` |
| `MCP_TRUST_PROXY` | no | `0` (set to the hop count behind a trusted proxy) |
| `MCP_ALLOWED_REDIRECT_URIS` | no | — (unset = accept any DCR redirect URI) |

No `GYM_API_IDENTIFIER`/`PASSWORD` in HTTP mode — credentials come from each
user's login.

### Deployment

- `apps/mcp/Dockerfile` (node:20-alpine, multi-stage, runs `dist/http-main.js`
  as non-root).
- New `mcp` service in the root `docker-compose.yml`; in Dokploy map the
  domain (e.g. `mcp-gym.irfanmaulana007.com`) to `mcp:3000`. It talks to the
  public API URL (or the compose-internal `http://api:8080` — loopback-only
  http rule means public https is the default).

## Testing

- **Unit** (`tests/unit-test/mcp`): sealing (round-trip, tamper, wrong
  purpose, expiry); HTTP config validation; provider — client registration
  round-trip, code single-use, client/redirect mismatch, refresh rotation via
  the API, access-token verification + expiry.
- **E2E** (`tests/e2e/mcp`): boots a mock API and the real HTTP app on
  ephemeral ports, then runs the **full OAuth flow** (metadata discovery →
  DCR → authorize → login form → code → token with PKCE) and calls tools with
  the MCP SDK's Streamable HTTP client; asserts unauthenticated `/mcp` → 401
  with `WWW-Authenticate`, wrong password re-renders the form, and refresh
  yields a working access token.

## Rollout

1. Merge; deploy the `mcp` service in Dokploy with `MCP_PUBLIC_URL` and
   `MCP_OAUTH_SECRET`, and route the domain to port 3000.
2. In Claude: Settings → Connectors → add custom connector →
   `https://<domain>/mcp` → sign in with the Gym Assistant account.
3. No API/web change, no migration. Rollback = remove the service.

## Risks

- The API's single-use refresh tokens: a replayed refresh (retry/concurrent)
  would otherwise trip the API's reuse detection and revoke all the user's
  sessions. The provider guards against this by forwarding each refresh token's
  embedded API token at most once per `jti` (grace-window cache + local reject on
  replay). The residual window is a process restart (see "Single replica").
- The login page is a password form on a second domain; it is served only
  over https, posts only to itself, and forwards to the existing login
  endpoint (same rate limits apply at the API).
- Account-wide login limiter lockout: the per-identifier cap (50 failed / 1 h)
  bounds distributed password guessing, but it is a deliberate, weaker lockout
  lever — someone who knows a username/email can hold that account's MCP sign-in
  at 429 for the window with 50 failed attempts. We accept this (it is far harder
  to abuse than an unbounded guessing oracle, and only blocks the MCP connector,
  not the web app). Moving login throttling into the Go API is the longer-term
  fix that would protect every client.
