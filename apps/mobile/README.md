# Gym Assistant — Mobile

Placeholder for a future native mobile app.

> **Status:** not part of Phase 1. No code yet.

Mobile is intentionally deferred. The [API](../api) is built to be
**client-agnostic** (JSON over HTTP, JWT auth, no web-specific assumptions) so a
native mobile client can reuse the exact same contract when this app is picked
up. See [`prd/0001`](../../prd/0001-workout-tracking-foundation.md) for the API
design that this app will consume.

When work begins, this directory will own its own stack, dependencies, scripts,
and config, and gain its own `README.md` / `CLAUDE.md`.
