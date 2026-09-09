---
name: reproduce-local
description: Prove a bug fix by reproducing the reported failure on a real running local environment first (RED), fixing the root cause, then re-running the identical scenario to confirm it's gone (GREEN). Use for bugs that need the app actually running — HTTP round-trips, background jobs, DB-state bugs, or web/mobile UI paths driven through a headless browser — rather than a pure unit test.
---

# Reproduce Locally Before & After the Fix

Prove a bug fix by **reproducing the reported failure on a real local environment first**, fixing the root cause, then **reproducing the exact same scenario again** to confirm the error is gone. No fix is "done" until you have watched the bug happen locally *and then watched it stop happening* after your change — on the same seeded input, through the same trigger.

**Arguments:** `$ARGUMENTS` (optional — a bug description, ticket/issue reference, endpoint, or click-path. If empty, ask the user what the reported failure is.)

## The discipline (read this first)

**You do not touch product code until you have made the bug happen on your machine, on purpose.** A bug you cannot reproduce, you cannot prove you fixed — and a green you reached without first seeing red proves nothing. The order is always:

1. **Understand** — one sentence of *expected vs. actual* for the reported failure.
2. **Spawn local** — bring up a real local environment (DB + any dependencies + the running service), migrated and reachable.
3. **Seed** — reconstruct the exact input state that triggers the bug.
4. **Reproduce → RED** — drive the real trigger (HTTP call / job run / UI click-path) and **capture the actual wrong output** — the same error that was reported. If you can't reproduce it, STOP: your diagnosis or your seed is wrong.
5. **Fix → GREEN** — only now edit code, the smallest change at the root cause.
6. **Re-reproduce** — run the *identical* scenario on the *same* local environment and confirm the wrong output is now correct.
7. **Regress-guard** — add an automated test so this can never silently come back.

> Use this skill when reproducing the real error needs the app *actually running* (an HTTP round-trip, a background/queue job, a DB-shaped state bug, a web/mobile UI path, an integration seam). When the bug has a clean unit-test surface, prefer a plain failing unit test (RED → GREEN) instead — same discipline, cheaper red. In practice: spin up here, and still land a regression test where a unit surface exists.

### Inspecting shared/remote state

If the bug was reported against a deployed or shared environment (staging, a hosted DB), **inspect that state read-only to reconstruct the input, but reproduce on local** where you can freely seed and run. Never mutate a shared environment. Redact PII (names, emails, phone numbers) before pasting any real rows anywhere. If a remote source is unreachable, say so rather than silently substituting different data.

## Instructions

### Phase 1: Understand the reported failure

1. **Parse `$ARGUMENTS`.** If it references a ticket/issue, gather its context (description, comments, any screenshots). If it's a free-form bug report, restate it. If nothing is given, ask the user for the exact reported failure.

2. **Write one sentence of expected-vs-actual.** Be precise about the **input state** that triggers it, the **wrong output**, and the **expected output**. Example: *"Given a user whose subscription is `expired`, the workout log page renders the action menu but its buttons are non-clickable, so the user cannot restart a plan — the menu items must be clickable."* If this sentence is fuzzy, you don't understand the bug yet — keep tracing before spinning anything up.

3. **Reconstruct the input (read-only where the state is shared).** Pull the exact record(s), field values, and related rows the failing code path reads. This is the ground truth you will seed into local.

### Phase 2: Spawn the local environment (HARD GATE)

> The environment must be genuinely up and reachable before you claim a reproduction. Verify each layer; don't assume.

4. **Start local infra** (DB + any dependencies the service needs) and wait for it to accept connections. Use the project's own dev setup (e.g. a `docker-compose` / dev script if one exists). Confirm each dependency is healthy before proceeding.

5. **Ensure env files exist and apply any migrations** so the local schema matches what the code expects.

6. **Run the service that owns the bug.** Pick the smallest surface that can reproduce it:
   - **Backend HTTP path** — run `apps/api` in dev/watch mode. Confirm it's live before proceeding (curl a health route or the root path).
   - **Background / queue job path** — run the relevant worker/entrypoint. Reproduce by enqueuing or seeding the job's trigger row.
   - **Full stack incl. web/mobile UI** — run `apps/web` (or `apps/mobile`) alongside the API. Use this only when the repro genuinely needs the UI.
   - Run long-lived processes in the **background** so you can keep issuing commands, and tail their logs — the actual error often surfaces there, not just in the response.

7. **State plainly what came up** (which services, which ports, migration status). If any layer failed to start, fix that before touching the bug — a repro against a half-up environment is worthless.

### Phase 2.5: Log in to the local UI (when the repro needs a session)

> Only needed when the repro is a UI path (or an authenticated HTTP call) and you must be signed in as a *specific* user. Skip this section for pure job/DB repros that don't need a session.

- **Pick a target user by role/permission, not by identity.** The bug reproduces *as a specific role* — that's what determines the scope/permissions the failing path checks. Query local for *any* user whose role (and any scope the bug depends on) matches the reported user's; the specific name/email is usually irrelevant. Only when the bug is about *one particular record's data* do you need to seed that exact shape (Phase 3).
- **Log in with the headless browser.** Use the [`playwright-cli` skill](../playwright-cli/SKILL.md) to drive the local sign-in page, fill credentials for the target user, submit, and confirm you land authenticated. For a visual bug, record the click-path with `playwright-cli video-start` / `video-stop`.
- **Or authenticate over HTTP** if you're driving `curl` instead of the browser — call the sign-in endpoint, grab the returned token, and pass it as `Authorization: Bearer <token>`.

> If the project provides a local-only auth shortcut (a seeded test user, a dev login bypass), use it — but only on local. Never enable a login bypass anywhere real.

### Phase 3: Seed & Reproduce → RED (HARD GATE — do not skip)

8. **Seed the exact input state** into the local DB, copying the *shape* of the rows you reconstructed in step 3. Record what you inserted so the reproduction is replayable.

9. **Drive the real trigger and capture the actual wrong output.** Match the mechanism to the bug:
   - **HTTP**: `curl` the exact endpoint with the payload that triggers it; capture status + body.
     ```bash
     curl -sS -i -X POST http://localhost:<port>/api/v1/<path> \
       -H 'Content-Type: application/json' -H "Authorization: Bearer <token>" \
       -d '{ ... the triggering payload ... }'
     ```
   - **Background/queue**: run the job / publish the message, then read the resulting DB rows and worker logs.
   - **UI (web/mobile)**: log in as the target user (Phase 2.5), then navigate the exact click-path with the `playwright-cli` skill; capture the wrong screen/state (a screenshot or video is ideal for a visual bug).
   - **DB-shaped**: run the query the code runs and show the wrong result set.

10. **Confirm the RED is the RIGHT red.** The captured output must be *the same failure that was reported* — the same wrong value / error / broken behavior — not an unrelated 500, an auth error, or a missing-seed artifact. If it fails for a different reason, your seed or trigger is off: fix the *reproduction* until it reproduces the *real* bug.

11. **If you cannot reproduce it, STOP and report.** Either the diagnosis is wrong (return to Phase 1 and keep tracing) or the environment/seed is wrong (fix it). Do **not** proceed to a fix you cannot prove. State the blocker to the user.

### Phase 4: Fix → GREEN

12. **Now edit product code** — the smallest change at the **root cause**, not a special-case guard that papers over the one reported input. If your instinct is a hardcoded value or a narrow `if` for the exact reported case, the fix is probably in the wrong place. Follow existing repo patterns.

13. **Rebuild/reload and re-run the IDENTICAL scenario** on the *same* local environment, with the *same* seeded state and the *same* trigger from step 9. Re-issue the exact `curl` / job run / UI click-path. Confirm the output is now **correct** — the wrong value is gone and the expected value is present. This side-by-side (same input, red → green) is the proof the fix landed in the right place.

14. **Verify the whole data flow end-to-end.** If it's a round-trip — upload *and* download, create *and* read, write *and* recap — reproduce and confirm **both** halves on local, not just the one you changed.

15. **Re-check the neighbor case** that was previously working, on the running environment, to prove you didn't shift the bug one step over.

### Phase 5: Regress-guard, verify, ship

16. **Land an automated regression test** wherever a unit surface exists (under `tests/` or the relevant app's test dir) — this is the durable guard; the live repro is not repeatable in CI. Assert the correct behavior plus edge cases around the boundary the bug lived near.

17. **Run the full checks** — the project's build, lint, type-check, and test commands for the affected app(s).

18. **Adversarial pass.** Spawn a skeptic subagent whose job is to find reasons the fix is wrong: was the RED real and captured, is the GREEN on the identical seeded scenario, is there a hardcoded/over-narrow patch that regresses on rephrased input, do all checks pass.

19. **Commit and open the PR** following the project git workflow — create a `fix/<slug>` branch off `main`, never commit on `main`, never push to `main` directly. Open the PR ready for review (see the [`pr` skill](../pr/SKILL.md)). Commit the product fix and the regression test together.

20. **PR description must include the live reproduction** (in addition to the usual root-cause/summary):

```markdown
## Local Reproduction (before & after the fix)

### Environment spun up
- Services: [DB + dependencies] + [api / worker / web] on port `<port>`, migrations applied.

### Seeded input state
- [the exact rows/values inserted locally that trigger the bug]

### Trigger + observed wrong result (RED — before the fix)
- **Command / click-path:** [exact `curl` / job run / UI steps]
- **Wrong output:** [the actual response/log/screen — the same failure reported]

### Same scenario after the fix (GREEN)
- **Command / click-path:** [identical to above]
- **Correct output:** [the now-correct response/log/screen]

### Regression test
- [`path/to/xxx.test.ts` — `describes the new case`], RED before / GREEN after.
```

## Completion criteria

- [ ] A one-sentence expected-vs-actual for the reported failure.
- [ ] A real local environment was **spun up and verified reachable** (services + ports + migrations stated).
- [ ] The exact input state was **seeded into the local DB**.
- [ ] The **same reported failure was reproduced live (RED)** and captured — not an unrelated error.
- [ ] The fix addresses the **root cause**, with no hardcoded/over-narrow patch.
- [ ] The **identical scenario was re-run and now passes (GREEN)** on the same seeded state — the red→green proof.
- [ ] Round-trip flows verified **end-to-end** on local; the neighbor case still works.
- [ ] A regression test was added where a unit surface exists; build, lint, type-check, and tests are clean.
- [ ] PR opened ready-for-review with the **before/after live reproduction** documented; branch is not `main`.

## Notes
- Prefer the **smallest running surface** that reproduces the bug (a single endpoint/job over the full stack) — faster loop, fewer moving parts.
- Run long-lived services in the background and **tail their logs** — the real error often lives there, not in the HTTP body.
- Never seed or mutate shared/deployed environments; they are read-only inspection sources. All writes are local-only.
- To reproduce an authenticated UI path, log in as any matching-role user via the local sign-in (Phase 2.5), driving the browser with the [`playwright-cli` skill](../playwright-cli/SKILL.md).
- If reproducing needs a scenario the running app can't easily produce but a unit test can, switch to a failing unit test instead — same discipline, cheaper red.
- If the fix scope is large or uncertain, discuss with the user before implementing.
