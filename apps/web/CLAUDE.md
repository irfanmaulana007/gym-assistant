# CLAUDE.md — Web (`apps/web`)

React + Vite + TypeScript frontend, **mobile-first**. Read with the root
[`CLAUDE.md`](../../CLAUDE.md) and [PRD 0001](../../prd/0001-workout-tracking-foundation.md).

## Principles

- **Mobile-first, always.** Design for a phone browser at the gym: single column,
  large thumb-reachable targets, primary actions within reach, one-handed logging.
  Enhance for desktop after the mobile layout works.
- **Native app feel, not a shrunk website.** The mobile view must look and behave
  like a native iOS/Android app. Push full screens for navigation (top nav bar +
  back chevron) and use native-style **sheets** for quick contextual actions —
  **never desktop-style dropdown/popover menus** anchored to a header control.
  Build from the tokens and primitives in `src/styles.css`. This is a repo rule:
  [`.claude/rules/native-mobile-ux.md`](../../.claude/rules/native-mobile-ux.md).
- **Fast logging.** Logging a set should take ≤ 3 interactions; show the previous
  session's numbers inline as the target to beat.
- **Feature-first structure.** Group code by feature under `src/features/*`
  (`auth`, `routines`, `exercises`, `sessions`, `progress`); shared UI in
  `src/components`, shared logic in `src/hooks` / `src/lib`.

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
