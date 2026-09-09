# Bug Fixing

**Reproduce first — every time. This is mandatory, not optional.** Before touching product code for any bug fix, you MUST reproduce the reported failure on a real local environment (or as a failing test), then fix the root cause, then reproduce the *identical* scenario again to prove the error is gone. A fix you cannot prove reproduces-then-resolves is not a fix — never ship a change you are "not sure is the right place."

The order is always: **reproduce the failure (RED) → fix the root cause → reproduce the same case again (GREEN) → regression-guard.** If you cannot reproduce the failure, STOP — your diagnosis or your assumptions are wrong; do not proceed to a fix you cannot prove.

Pick the reproduction that matches the bug's surface:

- **Failing unit test (preferred when the bug has a clean, testable surface).** Write the smallest test under [`tests/unit-test/`](../../tests/unit-test/) that fails for the reported reason, fix the root cause, watch it go green, and leave the test in place as a durable regression guard.
- **Running the app locally.** When reproducing needs the app actually running — HTTP round-trips against `apps/api`, UI paths in `apps/web`, or device flows in `apps/mobile` — spin up the relevant app, trigger the live error, fix, then re-run the exact same scenario. Add an end-to-end guard under [`tests/e2e/`](../../tests/e2e/) when the path is worth protecting.

When fixing a bug, always verify the entire data flow end-to-end (e.g., create AND read, request AND response, write AND sync) before considering the fix complete. Don't stop at fixing one half of a round-trip operation.
