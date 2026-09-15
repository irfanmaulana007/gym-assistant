# PRD 0010 — Refresh Tokens & Longer-Lived Sessions

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Approved |
| Created | 2026-09-15 |
| Updated | 2026-09-15 |
| App | api, web |

## 1. Problem

Users are forced to log in again roughly every hour. The web app holds a single
short-lived **JWT access token** (default `ACCESS_TOKEN_TTL_MINUTES=60`) in
`localStorage`; there is **no refresh mechanism**. When the access token expires,
the next API call returns `401`, the web client's central handler clears the
token, and `ProtectedRoute` bounces the user to `/login`. There is no way to keep
a session alive without re-entering credentials.

This is the top friction point for a gym app used in short, frequent bursts
between sets: nobody wants to type their password every visit.

## 2. Goals

- **An active user is effectively never logged out.** A returning user with a
  valid session resumes silently, without re-entering credentials.
- **Introduce a proper refresh-token mechanism** so short access-token lifetimes
  no longer translate into re-login prompts.
- **Keep it secure** — refresh tokens are opaque, stored hashed, rotated on every
  use, revocable, and expire after a bounded period of inactivity.
- **No change to the layered architecture** or the client-agnostic API contract;
  the future mobile app must be able to use the same endpoints.

### Non-goals

- Cookie-based auth / `HttpOnly` cookies (the API is bearer-token, client-agnostic
  by design — see `apps/api/CLAUDE.md`). Kept as-is.
- Multi-device session management UI ("log out my other devices"). The data model
  supports it (per-token rows), but no UI ships here.
- OAuth / social login.

## 3. Design

### 3.1 Token model

| Token | Type | Lifetime | Storage | Purpose |
|-------|------|----------|---------|---------|
| **Access** | Stateless HS256 JWT (unchanged) | short (`ACCESS_TOKEN_TTL_MINUTES`, default 60) | `localStorage` `gym.token` | Authorize API calls via `Authorization: Bearer`. |
| **Refresh** | Opaque random 256-bit string | long (`REFRESH_TOKEN_TTL_DAYS`, default 30) | `localStorage` `gym.refreshToken` | Mint a new access token (and a rotated refresh token) without credentials. |

The refresh token is **opaque**, not a JWT: 32 random bytes (`crypto/rand`),
base64url-encoded. Only its **SHA-256 hash** is stored, so a database leak cannot
be replayed. The raw value is returned to the client exactly once per issuance.

### 3.2 New database table (migration `0005_refresh_tokens.sql`)

```sql
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at  TIMESTAMPTZ            -- NULL = active
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);
```

### 3.3 Rotation & reuse detection

- **Rotation:** every successful `POST /auth/refresh` revokes the presented token
  and issues a brand-new access+refresh pair. A refresh token is single-use.
- **Sliding expiry:** each rotation issues a refresh token with a fresh
  `REFRESH_TOKEN_TTL_DAYS` window, so an active user stays logged in indefinitely;
  an inactive user is logged out after the window lapses.
- **Reuse detection:** presenting an already-revoked token indicates theft/replay.
  The API revokes **every active refresh token for that user** and returns `401`,
  forcing a fresh login on all devices.

### 3.4 API endpoints

All under `/api/v1`, **public** (no access token required — the access token may
already be expired):

- `POST /auth/refresh` — body `{ "refresh_token": "…" }` → `200` with
  `{ token, refresh_token, user }`. Unknown / expired / revoked → generic `401`
  `unauthorized`.
- `POST /auth/logout` — body `{ "refresh_token": "…" }` → `204`. Revokes the
  token. Idempotent; never reveals whether the token existed.

`POST /auth/register` and `POST /auth/login` responses gain a `refresh_token`
field alongside the existing `token` and `user`.

### 3.5 Web client

- Store both tokens in `localStorage` (`gym.token`, `gym.refreshToken`).
- The typed `fetch` wrapper (`src/api/client.ts`) gains a **transparent
  refresh-on-401**: on a `401` for a non-anonymous request, it calls
  `/auth/refresh` **once** (concurrent calls share a single in-flight refresh),
  and on success retries the original request with the new access token. Only if
  the refresh itself fails does it invoke the central `onUnauthorized` handler
  (→ logout → redirect to `/login`).
- `logout()` best-effort calls `POST /auth/logout` to revoke the refresh token,
  then clears both tokens locally regardless of the result.

### 3.6 Configuration

| Env var | Default | Meaning |
|---------|---------|---------|
| `ACCESS_TOKEN_TTL_MINUTES` | `60` | Access-token lifetime (unchanged). |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | Refresh-token lifetime / max inactivity window. |

## 4. Security considerations

- Refresh tokens stored **hashed** (SHA-256) — a DB dump is not replayable.
- **Rotation + reuse detection** limits the blast radius of a stolen token.
- Generic `401`s on refresh failures — no enumeration of which tokens exist.
- `ON DELETE CASCADE` ties tokens to the user; deleting a user revokes them.
- Access tokens remain stateless and short-lived; revocation is enforced at the
  refresh boundary (a revoked session can live at most one access-token TTL).

## 5. Testing

Per `.claude/rules/testing.md`, every change ships a unit **and** an e2e test:

- **API unit** (`tests/unit-test/api/`) — refresh-token generation/hashing:
  raw≠hash, deterministic hash, unique raws.
- **API e2e** (`tests/e2e/api/`) — register returns a refresh token; refresh
  rotates (new pair, old token rejected); the new access token authorizes `/me`;
  logout revokes; reuse of a rotated token triggers family revocation.
- **Web unit** (`tests/unit-test/web/`) — client refreshes on `401` and retries;
  falls back to `onUnauthorized` when refresh fails.
- **Web e2e** (`tests/e2e/web/`) — a session with a stale access token but a valid
  refresh token silently recovers instead of bouncing to `/login`.

## 6. Rollout

- Additive migration (`0005`) — no change to existing tables; safe to apply on a
  live DB.
- Backward compatible: existing clients keep working with just the access token;
  they simply won't refresh until updated. New clients get the refresh flow.
- New env var `REFRESH_TOKEN_TTL_DAYS` has a safe default; no ops action required
  beyond documenting it in `.env.example`.
