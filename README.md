# Gym Assistant

A personal training companion for organizing workouts and tracking **progressive
overload**. Group your training into workout days (Push, Pull, Legs, …), fill
each day with exercises that carry target sets and reps, log the weights you
actually lift, and watch your numbers climb over time.

> **Status:** Phase 1 — foundation. See
> [`prd/0001-workout-tracking-foundation.md`](prd/0001-workout-tracking-foundation.md)
> for the plan. No application code is implemented yet; this repo currently holds
> the structure, docs, and product requirements.

## What it does

- **Group your schedule** into workout days you create freely (Push Day, Pull
  Day, Leg Day, …).
- **Add exercises** to each day (Bench Press, Incline Bench Press, …) with target
  sets and reps.
- **Log every set** — weight × reps — during a workout session.
- **Track progressive overload** — see each exercise's weight history and trend.

Web-first and **mobile-first in layout**, built so a native mobile app can reuse
the same API later.

## Monorepo layout

```
gym-assistant/
├── apps/
│   ├── api/          # Backend — Go + PostgreSQL (client-agnostic JSON API)
│   ├── web/          # Web frontend — React + Vite + TypeScript (mobile-first)
│   └── mobile/       # Placeholder for a future native app (not in Phase 1)
├── prd/              # Product Requirement Documents (design before code)
├── documentations/   # Reference docs
├── tests/
│   ├── unit-test/    # Unit tests
│   └── e2e/          # End-to-end tests
├── scripts/          # Repo tooling (e.g. PR label bootstrap)
└── .claude/          # Claude Code rules & skills
```

Each app under `apps/` **owns its own dependencies, scripts, and config**. Work
on one app at a time and follow that app's conventions — see its `README.md` and
`CLAUDE.md`.

## Tech stack

| Layer | Choice |
|-------|--------|
| API | Go, PostgreSQL, JSON over HTTP, JWT auth |
| Web | React, Vite, TypeScript |
| Mobile | _Future phase — API is designed to be reused as-is_ |

## Getting started

Nothing to run yet — Phase 1 begins with the API foundation (see the rollout plan
in the PRD). As each app is scaffolded, its own `README.md` will document how to
install, configure (`.env.example`), run, lint, type-check, and test it.

## Contributing

- **Design before code:** substantial changes get a PRD in [`prd/`](prd/) first.
- **Git workflow:** never commit to `main`; branch, then open a PR. Commit and PR
  titles follow `[scope][type] Message` — see
  [`.claude/rules/git-workflow.md`](.claude/rules/git-workflow.md).
- **Bug fixes:** reproduce first (RED → fix → GREEN) — see
  [`.claude/rules/bug-fixing.md`](.claude/rules/bug-fixing.md).
- **PR labels:** exactly one label per PR — see
  [`.claude/rules/pr-labeling.md`](.claude/rules/pr-labeling.md).
