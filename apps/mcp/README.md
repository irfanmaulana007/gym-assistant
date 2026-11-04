# Gym Assistant MCP server

A small, **read-only** [Model Context Protocol](https://modelcontextprotocol.io)
server that lets an MCP client (Claude Code, Claude Desktop, …) read your
Gym Assistant profile and workout history. It talks to the existing HTTP API
(`apps/api`) with a JWT — it never connects to the database directly and never
writes any data.

Pointed at **production** by default (`https://api-gym.irfanmaulana007.com`),
overridable via `GYM_API_BASE_URL`.

## What it exposes

All tools are read-only (GET-only against the API):

| Tool | Endpoint | What you get |
|------|----------|--------------|
| `get_profile` | `GET /auth/me` | Your profile, body metrics, goals, unit prefs |
| `list_routines` | `GET /routines` | All routines (Push/Pull/Legs…) |
| `get_routine` | `GET /routines/{id}` | One routine + its exercises and targets |
| `get_exercise_history` | `GET /exercises/{id}/history` | Derived progressive-overload history for an exercise |
| `search_exercise_catalog` | `GET /exercise-catalog` | Search the shared movement catalog |
| `list_sessions` | `GET /sessions` | Workout sessions (paginated) |
| `get_session` | `GET /sessions/{id}` | One session: events, exercises, every logged set |
| `get_analytics_dashboard` | `GET /analytics/dashboard` | Headline training stats |
| `get_analytics_summary` | `GET /analytics/summary` | Totals / averages |
| `get_analytics_volume` | `GET /analytics/volume` | Volume bucketed over time |
| `get_analytics_muscle_groups` | `GET /analytics/muscle-groups` | Volume by muscle group |
| `get_analytics_consistency` | `GET /analytics/consistency` | Frequency / streaks |
| `get_analytics_records` | `GET /analytics/records` | Personal records |
| `get_analytics_exercise_trends` | `GET /analytics/exercise-trends` | Overload trends across exercises |

## Configuration

All config comes from the environment (no hardcoded secrets). Auth — supply **one**:

1. `GYM_API_IDENTIFIER` (or `GYM_API_EMAIL`) **and** `GYM_API_PASSWORD` — login
   (recommended; the server rotates tokens internally for its lifetime).
2. `GYM_API_TOKEN` — a pre-obtained short-lived JWT access token (used as-is, no
   auto-renew).

> A raw refresh token is intentionally **not** accepted as a startup credential:
> the API single-uses/rotates refresh tokens, so replaying one on each launch
> would trigger reuse-detection and revoke every session you have.

Optional:
- `GYM_API_BASE_URL` (defaults to production; must be `https` for any non-local host).
- `GYM_API_TIMEOUT_MS` (per-request timeout, default `15000`).

See [`.env.example`](.env.example).

## Build & run

```bash
# from the repo root (deps hoist to the workspace root)
npm install
npm --workspace apps/mcp run build     # compile to dist/
npm --workspace apps/mcp run dev       # run from source (tsx), for local testing
```

The server speaks MCP over **stdio**. It writes nothing to stdout except the
protocol; diagnostics go to stderr.

## Add it to Claude Code

A project-scoped [`.mcp.json`](../../.mcp.json) is already committed at the repo
root. It references the built server and reads your credentials from the
environment (via `${VAR}` expansion) so **no secret is ever committed**:

```jsonc
// .mcp.json (repo root) — already present
{
  "mcpServers": {
    "gym-assistant": {
      "command": "node",
      "args": ["apps/mcp/dist/index.js"],
      "env": {
        "GYM_API_BASE_URL": "${GYM_API_BASE_URL:-https://api-gym.irfanmaulana007.com}",
        "GYM_API_IDENTIFIER": "${GYM_API_IDENTIFIER}",
        "GYM_API_PASSWORD": "${GYM_API_PASSWORD}"
      }
    }
  }
}
```

To use it:

1. **Build once** (the server runs from `dist/`, which is git-ignored):
   `npm install && npm --workspace apps/mcp run build`
2. **Export your credentials** in the shell that launches Claude Code:
   ```bash
   export GYM_API_IDENTIFIER=you@example.com
   export GYM_API_PASSWORD=your-password
   ```
3. Start Claude Code in this repo and approve the `gym-assistant` server when
   prompted (`/mcp` shows its status).

Prefer not to use `.mcp.json`? Register it imperatively instead:

```bash
claude mcp add gym-assistant \
  --env GYM_API_IDENTIFIER=you@example.com \
  --env GYM_API_PASSWORD=your-password \
  -- node /absolute/path/to/apps/mcp/dist/index.js
```

Then ask Claude things like _"what did my last leg day look like?"_ or
_"show my bench press progression over the last 90 days."_

## Tests

```bash
npm --workspace apps/mcp run test   # unit + e2e (tests/{unit-test,e2e}/mcp)
```

Tests never touch production or any dev port — the e2e test spins up its own
mock API on an ephemeral port and drives the server over stdio.
