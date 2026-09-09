# PRD 0001 — Workout Tracking Foundation

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Draft |
| Created | 2026-09-09 |
| Updated | 2026-09-09 |
| App | api, web |

## 1. Summary

Gym Assistant is a personal training companion that lets a lifter organize their
training into **grouped workout days** (Push Day, Pull Day, Leg Day, …), fill
each day with **exercises** that carry target sets and reps, **log the weights
actually lifted** each session, and **monitor progressive overload** over time.

This first phase delivers the end-to-end backbone: a Go + PostgreSQL API that is
general enough to serve any client, and a mobile-first React (Vite) web app that
consumes it. A native mobile app is explicitly **out of scope** for this phase,
but the API contract is designed so a future mobile client can reuse it without
change.

## 2. Problem & Motivation

Lifters who care about progressive overload need to answer one question every
session: *"what did I lift last time, and can I beat it today?"* Spreadsheets and
notes apps make this tedious — no structure around workout days, no quick way to
see an exercise's weight history, no sense of trend.

We want a purpose-built tool that:

- Structures training the way lifters actually think about it — by **day/muscle
  group**, then by **exercise**.
- Makes logging a set **fast** (weight × reps, one tap/one field at a time).
- Surfaces **history and progression** for each exercise so overload is visible.

## 3. Goals

- Users can create and organize **workout days** (grouped routines) freely.
- Each workout day holds an ordered list of **exercises** with target sets/reps.
- Users can start a **workout session** for a day and log the **weight and reps
  of each set**.
- Users can view the **weight history** of any exercise and see a simple
  **progression trend** (progressive overload monitoring).
- The **API is client-agnostic** (JSON over HTTP, token auth) so the same
  backend serves the web app now and mobile later.
- The web experience is **mobile-first** and usable one-handed at the gym.

## 4. Non-Goals (this phase)

- Native iOS/Android app (`apps/mobile` stays a placeholder).
- Social features, sharing, or coaching.
- Prebuilt exercise library, GIF/video demonstrations, or muscle diagrams.
- Rest timers, supersets, drop sets, RPE/RIR, 1RM estimation formulas.
- Offline-first sync / conflict resolution.
- Charts beyond a single per-exercise progression view.
- Multi-tenant / team accounts (single user per account only).

## 5. Personas & Key User Stories

**Persona — Riko, the self-coached lifter.** Trains a Push/Pull/Legs split, wants
to beat last week's numbers.

- As Riko, I can create a "Push Day" and add "Bench Press" and "Incline Bench
  Press" with target 4×8.
- As Riko, I can reorder exercises within a day.
- As Riko, at the gym I open Push Day, start a session, and log 60kg × 8, 62.5kg
  × 8, … per set.
- As Riko, I can open "Bench Press" and see every past session's top set and a
  trend so I know if I'm progressing.

## 6. Domain Model

Five core entities. Everything is **scoped to a `user`**.

```
User (1) ──< (N) Routine ──< (N) Exercise
                   │                 │
                   │ (a day is       │ (a session logs sets
                   │  performed as   │  against the day's
                   ▼  a session)     ▼  exercises)
              WorkoutSession ──< (N) SetLog >── Exercise
```

| Entity | Purpose | Key fields |
|--------|---------|-----------|
| `User` | Account owner; scopes all data. | `id`, `email`, `password_hash`, `display_name`, `created_at` |
| `Routine` | A grouped workout day (Push/Pull/Legs). The "schedule group". | `id`, `user_id`, `name`, `notes`, `position`, `created_at`, `updated_at` |
| `Exercise` | A movement within a routine, with targets. | `id`, `routine_id`, `name`, `target_sets`, `target_reps`, `position`, `notes`, `created_at`, `updated_at` |
| `WorkoutSession` | One performance of a routine on a date. | `id`, `user_id`, `routine_id`, `performed_at`, `notes`, `created_at` |
| `SetLog` | One logged set — the unit of weight history. | `id`, `session_id`, `exercise_id`, `set_number`, `weight`, `weight_unit`, `reps`, `completed`, `created_at` |

**Notes & decisions**

- `weight` is stored as a numeric value plus a `weight_unit` (`kg` / `lb`) so a
  session isn't ambiguous. A user-level default unit is a Phase-2 refinement.
- **Progressive overload** is not a stored entity — it is *derived* by querying
  `SetLog` rows for an exercise across sessions (e.g. max weight per session,
  estimated volume = Σ weight × reps). Keeping it derived avoids denormalized
  data that can drift.
- `position` fields give stable, explicit ordering for routines and exercises
  (drag-to-reorder friendly) rather than relying on `created_at`.
- Deleting a `Routine` soft-considerations: for Phase 1 a routine delete cascades
  to its exercises, but **historical sessions/set logs are retained** so history
  isn't lost. Exercises therefore keep a denormalized `name` snapshot is *not*
  needed yet because we keep the exercise row; see Open Questions.

## 7. API Design

RESTful JSON over HTTP. Versioned under `/api/v1`. Auth via **JWT bearer token**.
All list/detail responses are scoped to the authenticated user server-side; the
client never passes a `user_id`.

### Conventions

- Base path: `/api/v1`
- Auth header: `Authorization: Bearer <token>`
- Content type: `application/json`
- Timestamps: RFC 3339 UTC.
- Errors: consistent envelope `{ "error": { "code": "string", "message": "string", "details": {} } }`.
- IDs: UUIDs (opaque strings to clients).

### Endpoints (Phase 1)

**Auth**

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/auth/register` | Create account, return token. |
| `POST` | `/api/v1/auth/login` | Exchange credentials for token. |
| `GET`  | `/api/v1/auth/me` | Current user profile. |

**Routines (workout days)**

| Method | Path | Purpose |
|--------|------|---------|
| `GET`    | `/api/v1/routines` | List the user's routines (ordered by `position`). |
| `POST`   | `/api/v1/routines` | Create a routine. |
| `GET`    | `/api/v1/routines/{id}` | Get a routine with its exercises. |
| `PATCH`  | `/api/v1/routines/{id}` | Update name/notes/position. |
| `DELETE` | `/api/v1/routines/{id}` | Delete a routine. |
| `PATCH`  | `/api/v1/routines/reorder` | Bulk reorder routines. |

**Exercises**

| Method | Path | Purpose |
|--------|------|---------|
| `POST`   | `/api/v1/routines/{routineId}/exercises` | Add an exercise to a routine. |
| `PATCH`  | `/api/v1/exercises/{id}` | Update name/targets/notes/position. |
| `DELETE` | `/api/v1/exercises/{id}` | Remove an exercise. |
| `PATCH`  | `/api/v1/routines/{routineId}/exercises/reorder` | Bulk reorder exercises. |
| `GET`    | `/api/v1/exercises/{id}/history` | Weight history + progression for the exercise. |

**Workout sessions & set logs**

| Method | Path | Purpose |
|--------|------|---------|
| `POST`   | `/api/v1/routines/{routineId}/sessions` | Start a session for a routine. |
| `GET`    | `/api/v1/sessions` | List past sessions (paginated). |
| `GET`    | `/api/v1/sessions/{id}` | Get a session with its set logs. |
| `PATCH`  | `/api/v1/sessions/{id}` | Update notes / performed_at / finish. |
| `DELETE` | `/api/v1/sessions/{id}` | Delete a session. |
| `POST`   | `/api/v1/sessions/{id}/sets` | Log a set (exercise, set_number, weight, reps). |
| `PATCH`  | `/api/v1/sets/{id}` | Edit a logged set. |
| `DELETE` | `/api/v1/sets/{id}` | Delete a logged set. |

### Example — exercise history (progressive overload)

`GET /api/v1/exercises/{id}/history`

```json
{
  "exercise": { "id": "…", "name": "Bench Press", "target_sets": 4, "target_reps": 8 },
  "sessions": [
    {
      "session_id": "…",
      "performed_at": "2026-09-02T09:12:00Z",
      "top_set": { "weight": 62.5, "weight_unit": "kg", "reps": 8 },
      "total_volume": 1900.0,
      "sets": [
        { "set_number": 1, "weight": 60, "reps": 8 },
        { "set_number": 2, "weight": 62.5, "reps": 8 }
      ]
    }
  ],
  "trend": { "metric": "top_set_weight", "direction": "up", "change": 2.5 }
}
```

`top_set`, `total_volume`, and `trend` are **computed server-side** from `SetLog`
rows so every client renders the same progression without duplicating logic.

## 8. Web App Design (mobile-first)

- **Stack:** React + Vite + TypeScript. Client-side routing. A thin typed API
  client wraps `fetch` and injects the bearer token.
- **Layout:** single-column, thumb-reachable primary actions, bottom-anchored
  CTAs. Designed for a phone browser at the gym; scales up to desktop.

**Primary screens**

1. **Routines list** — the user's workout days; create / reorder / open.
2. **Routine detail** — exercises with targets; add/edit/reorder; "Start session".
3. **Active session** — for each exercise, log sets (weight × reps) quickly;
   shows *last session's numbers* inline as the target to beat.
4. **Exercise history** — past sessions' top sets, volume, and a single
   progression line.
5. **Auth** — register / login.

State: server state via a data-fetching layer (e.g. React Query-style caching);
minimal global state beyond the auth token.

## 9. Data & Migrations

- PostgreSQL. Schema managed by ordered SQL migrations under
  `apps/api/migrations/` (see git-workflow scope `migration`).
- Every table carries `id UUID PRIMARY KEY`, `created_at`, and (where mutable)
  `updated_at`.
- Foreign keys enforce ownership chains; `user_id` indexed on every root table;
  `(exercise_id, session_id)` indexed on `set_logs` for fast history queries.

## 10. Security

- Passwords hashed with bcrypt/argon2; never stored or logged in plaintext.
- JWT signed with a server secret from env/config; short-lived access token
  (refresh token strategy deferred to Phase 2, documented as an open question).
- Every query is scoped to the authenticated `user_id` server-side — no client
  can read or mutate another user's data by guessing an ID (authorization check
  on every resource).
- All inputs validated; parameterized queries only.
- Secrets via environment variables — never committed. Each app ships an
  `.env.example`.

## 11. Testing & Verification

- **API:** unit tests for services/validation; integration tests hitting a real
  Postgres (round-trip create→read for every resource, per the bug-fixing rule).
- **Web:** component tests for the logging flow; an e2e happy-path (create
  routine → add exercise → log session → see history) under `tests/e2e/`.
- Each app's `lint`, `typecheck`, and `build` must pass before merge.

## 12. Rollout Plan

Phased delivery, each a reviewable PR to `main`:

1. **Scaffolding** — folder structure, README, CLAUDE.md, this PRD. *(this change)*
2. **API foundation** — Go project, config, DB connection, migrations for the
   five entities, health check.
3. **Auth** — register/login/me + JWT middleware.
4. **Routines & exercises** — full CRUD + reorder.
5. **Sessions & set logs** — logging endpoints.
6. **Exercise history** — derived progression endpoint.
7. **Web app** — Vite scaffold, API client, the five screens.
8. **E2E happy path** + polish.

## 13. Success Metrics

- A user can go from zero to logging a full workout in **under 2 minutes**.
- Logging a single set takes **≤ 3 interactions**.
- Exercise history correctly reflects every logged set (no data loss on
  routine/exercise edits).

## 14. Open Questions

- **Exercise history after rename/delete:** if an exercise is deleted, should its
  historical set logs remain visible under a snapshot name? (Leaning: keep the
  exercise row, soft-delete in a later phase.)
- **Refresh tokens / session length:** access-token-only for Phase 1; revisit.
- **Per-user default weight unit:** store on `User` now or defer? (Deferred.)
- **Custom day types/labels vs. free-text names:** Phase 1 uses free-text routine
  names; a typed "category" (push/pull/legs/…) could come later for filtering.
