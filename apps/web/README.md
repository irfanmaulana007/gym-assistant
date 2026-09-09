# Gym Assistant — Web

Mobile-first web frontend for Gym Assistant, built with **React + Vite +
TypeScript**. Consumes the [API](../api) over JSON/HTTP.

> **Status:** foundation in place — Vite + React + TS scaffold, a typed API
> client (JWT injection + central 401 handling), React Query, mobile-first
> design system, and the auth screens (register/login) with protected routing.
> Routines/exercises/session screens land next. See
> [`prd/0001`](../../prd/0001-workout-tracking-foundation.md) and
> [`prd/0002`](../../prd/0002-session-lifecycle-and-metrics.md).

## Running locally

This app is an npm **workspace**; install from the repo root so shared test
tooling is available to the repo-root `tests/` tree.

```bash
# from the repo root
npm install

# from apps/web
cp .env.example .env.local     # set VITE_API_BASE_URL (default http://localhost:8080)
npm run dev                    # http://localhost:5173
npm run build                  # tsc -b + vite build
npm run lint && npm run typecheck
```

### Tests

Per `.claude/rules/testing.md`, tests live in the repo-root `tests/` tree:

```bash
npm run test        # vitest unit tests  (tests/unit-test/web)
npm run test:e2e    # playwright e2e      (tests/e2e/web) — needs the API running
```

## Tech

- **Framework:** React (TypeScript)
- **Build tool:** Vite
- **Design:** mobile-first — single column, thumb-reachable actions, usable
  one-handed at the gym; scales up to desktop.

## Intended structure

```
apps/web/
├── public/              # static assets
├── src/
│   ├── api/             # typed API client (fetch + bearer-token injection)
│   ├── components/      # shared, reusable UI
│   ├── features/        # feature modules
│   │   ├── auth/        #   register / login
│   │   ├── routines/    #   workout days (list, detail, reorder)
│   │   ├── exercises/   #   exercises within a routine
│   │   ├── sessions/    #   active workout logging
│   │   └── progress/    #   exercise history / overload trend
│   ├── hooks/           # shared hooks
│   ├── lib/             # utilities (formatting, storage, etc.)
│   ├── pages/           # routed pages
│   └── types/           # shared TypeScript types (mirror the API contract)
├── index.html           # (added when the web app is scaffolded)
├── package.json         # (added when the web app is scaffolded)
├── vite.config.ts       # (added when the web app is scaffolded)
└── .env.example         # (added when the web app is scaffolded)
```

## Screens (Phase 1)

1. **Routines list** — workout days; create / reorder / open.
2. **Routine detail** — exercises with targets; add/edit/reorder; start a session.
3. **Active session** — log sets (weight × reps) fast; shows last session's
   numbers as the target to beat.
4. **Exercise history** — past top sets, volume, and a progression line.
5. **Auth** — register / login.

## Conventions

- **Server state** via a caching data layer; keep global client state minimal
  (essentially just the auth token).
- **API base URL and other config** come from env (`.env.example`) — never
  hardcode endpoints or secrets.
- Types under `src/types` mirror the API contract so the client stays in sync.
- Before done, run the app's `lint`, `typecheck`, and `build`.
