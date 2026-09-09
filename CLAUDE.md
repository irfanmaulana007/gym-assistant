# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository.

## What this project is

**Gym Assistant** — a workout tracker centered on **progressive overload**. Users
group training into workout days (Push/Pull/Legs…), add exercises with target
sets/reps, log the weight and reps of each set per session, and review each
exercise's weight history and trend.

Full product spec: [`prd/0001-workout-tracking-foundation.md`](prd/0001-workout-tracking-foundation.md).

## Monorepo shape

Three independent apps under [`apps/`](apps/), each owning its own dependencies,
scripts, and config:

- [`apps/api`](apps/api/CLAUDE.md) — **Go + PostgreSQL** backend. Client-agnostic
  JSON API (JWT auth) so web now and mobile later share one contract.
- [`apps/web`](apps/web/CLAUDE.md) — **React + Vite + TypeScript** frontend,
  **mobile-first**.
- [`apps/mobile`](apps/mobile) — placeholder; not part of Phase 1.

Supporting dirs: [`prd/`](prd/) (requirements), [`documentations/`](documentations/)
(reference docs), [`tests/`](tests/) (`unit-test/`, `e2e/`), [`scripts/`](scripts/).

## Core domain model

Five entities, all scoped to a `user`:

- **User** — account owner; scopes all data.
- **Routine** — a grouped workout day (the "schedule group"), e.g. Push Day.
- **Exercise** — a movement inside a routine, with `target_sets` / `target_reps`.
- **WorkoutSession** — one performance of a routine on a date.
- **SetLog** — one logged set (`weight`, `reps`, `set_number`) — the unit of
  weight history.

**Progressive overload is derived, not stored** — compute trends from `SetLog`
rows, don't denormalize.

## Working rules (enforced — see `.claude/rules/`)

- **Design before code** — substantial changes get a PRD in [`prd/`](prd/) first,
  using the `NNNN-short-kebab-title.md` convention and the standard metadata
  table. Update the index in [`prd/README.md`](prd/README.md).
- **Stay scoped to one app** — follow the conventions and tooling of the app you
  are touching; don't introduce cross-app patterns unless the change is genuinely
  cross-cutting.
- **Run the app's checks** — after changes, run that app's `lint`, `typecheck`,
  and `build` before considering work done.
- **Reproduce bugs first** — RED → fix root cause → GREEN → regression guard.
  Verify the full round-trip (write *and* read), not just one half.
- **Git** — never push to `main`; branch first. Commit/PR titles:
  `[scope][type] Message` (scopes: `api`, `web`, `mobile`, `migration`,
  `scripts`, `docs`). Open PRs ready for review (not draft).
- **PR labels** — exactly one, derived from the title's type bracket.
- **Security** — no hardcoded secrets (use env/config); validate all input;
  parameterized queries only; scope every query to the authenticated user.

See the authoritative rules in [`.claude/rules/`](.claude/rules/):
`prd-documents.md`, `git-workflow.md`, `development-best-practices.md`,
`bug-fixing.md`, `pr-labeling.md`.
