import { defineConfig, devices } from '@playwright/test'

// E2E tests live in the repo-root tests/e2e/web tree (per
// .claude/rules/testing.md). They drive a real browser against the Vite dev
// server; the API must be reachable at VITE_API_BASE_URL (default :8080).
export default defineConfig({
  testDir: '../../tests/e2e/web',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    ...devices['iPhone 13'], // mobile-first: default to a phone viewport
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
