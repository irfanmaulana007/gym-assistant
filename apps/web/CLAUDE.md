# CLAUDE.md — Web (`apps/web`)

React + Vite + TypeScript frontend, **mobile-first**. Read with the root
[`CLAUDE.md`](../../CLAUDE.md) and [PRD 0001](../../prd/0001-workout-tracking-foundation.md).

## Principles

- **Mobile-first, always.** Design for a phone browser at the gym: single column,
  large thumb-reachable targets, primary actions within reach, one-handed logging.
  Enhance for desktop after the mobile layout works.
- **Fast logging.** Logging a set should take ≤ 3 interactions; show the previous
  session's numbers inline as the target to beat.
- **Feature-first structure.** Group code by feature under `src/features/*`
  (`auth`, `routines`, `exercises`, `sessions`, `progress`); shared UI in
  `src/components`, shared logic in `src/hooks` / `src/lib`.
- **Forms live in a sheet.** Any form that creates or edits an entity is
  presented through the shared [`Sheet`](src/components/Sheet.tsx) component —
  a **centered modal on desktop, slide-up bottom sheet on mobile**, with the
  animated show/hide it provides. Don't render entity forms as always-visible
  inline cards. Trigger them from a `+` nav-bar action and/or an empty-state
  button, and close the sheet on mutation success. Two deliberate exceptions,
  each documented here so they don't look like oversights: **full-page auth
  screens** (login/register) and the **in-session set-logging inputs**, which
  stay inline to honor the fast-logging rule below.

## Data & state

- All server data goes through the typed client in `src/api`, which injects the
  JWT bearer token. Handle 401 → redirect to login centrally.
- Prefer a caching data layer for server state; keep global client state minimal
  (auth token, maybe unit preference). Don't reach for a heavy global store.
- Types in `src/types` mirror the API contract — update them when the API changes
  so the two stay in sync.

## Config & secrets

- API base URL and any config come from Vite env vars (`.env.example`) — never
  hardcode URLs or secrets.

## Conventions

- Commit scope for frontend changes: `[web]` (e.g. `[web][feat] Add routines list`).
- Follow existing patterns in this app; don't introduce new state/styling
  approaches without reason.

## Verify before done

Run this app's `lint`, `typecheck` (`tsc`), and `build`. For UI bugs, reproduce
the exact path first (running the app / a failing test) before fixing — repo rule
`bug-fixing.md`. Protect the create-routine → add-exercise → log-session →
see-history happy path with an e2e test under [`tests/e2e`](../../tests/e2e).
