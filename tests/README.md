# Tests

All tests for the monorepo live here, split by kind. See the authoritative
[`.claude/rules/testing.md`](../.claude/rules/testing.md) — **every code change
ships with a unit test _and_ an e2e test.**

```
tests/
├── unit-test/   # fast, isolated unit tests (no network, no real DB)
└── e2e/         # end-to-end flows (HTTP round-trips, UI paths)
```

Organize by app inside each directory:

```
tests/unit-test/api/    tests/unit-test/web/
tests/e2e/api/          tests/e2e/web/
```

Each app documents how to run its tests in its own `README.md` / `CLAUDE.md`.
