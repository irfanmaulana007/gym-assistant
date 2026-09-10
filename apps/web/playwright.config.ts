import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// E2E tests live in the repo-root tests/e2e/web tree (per
// .claude/rules/testing.md). They drive a real browser against a Vite server
// backed by a real API.
//
// Port isolation (per .claude/rules/testing.md): the suite spins up its OWN Vite
// server and its OWN API+DB stack on dedicated ports, so it never collides with
// — or writes into — the developer's local dev servers on :5173 (web) and :8080
// (API). Both are started fresh here with reuseExistingServer:false.
//
//   WEB_PORT      Vite dev server for the tests        (default 4173)
//   E2E_API_PORT  self-contained API (tests/cmd/e2eserver) (default 8090)
//
// The API stack (embedded Postgres + assembled API) is launched by
// tests/cmd/e2eserver; see that command for its own env knobs.
const WEB_PORT = Number(process.env.WEB_PORT ?? 4173)
const API_PORT = Number(process.env.E2E_API_PORT ?? 8090)
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`
const API_ORIGIN = `http://localhost:${API_PORT}`

// The Go tests module (which owns the embedded-postgres dependency) lives at the
// repo root; run the e2e API stack from there.
const testsDir = fileURLToPath(new URL('../../tests', import.meta.url))

export default defineConfig({
  testDir: '../../tests/e2e/web',
  timeout: 30_000,
  use: {
    baseURL: WEB_ORIGIN,
    ...devices['iPhone 13'], // mobile-first: default to a phone viewport
  },
  webServer: [
    {
      // Self-contained API + ephemeral Postgres on their own ports — never :8080.
      // Build then `exec` the binary (rather than `go run`) so Playwright's
      // graceful-shutdown SIGTERM reaches the server directly — a `go run`
      // wrapper does not forward it, orphaning the embedded Postgres.
      command: 'go build -o ./bin/e2eserver ./cmd/e2eserver && exec ./bin/e2eserver',
      cwd: testsDir,
      env: {
        E2E_API_PORT: String(API_PORT),
        E2E_WEB_ORIGIN: WEB_ORIGIN,
      },
      url: `${API_ORIGIN}/healthz`,
      reuseExistingServer: false,
      // First run may download the embedded Postgres binary.
      timeout: 120_000,
      // On teardown, send SIGTERM (not an immediate SIGKILL) and wait, so the
      // server can stop its embedded Postgres instead of leaving it orphaned on
      // its port. Without this, Playwright hard-kills the process group and the
      // daemonized Postgres survives.
      gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // Dedicated Vite server on WEB_PORT (not :5173), pointed at the test API.
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      url: WEB_ORIGIN,
      env: { VITE_API_BASE_URL: API_ORIGIN },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
