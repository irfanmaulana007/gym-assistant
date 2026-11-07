import { test, expect } from '@playwright/test'

// E2E: the app is now wrapped in a Sentry <ErrorBoundary> and calls initSentry()
// before rendering (both added in apps/web/src/main.tsx). No VITE_SENTRY_DSN is
// configured for the e2e stack, so Sentry is a no-op — this verifies the
// ErrorBoundary wrapper and init call integrate without breaking normal
// rendering or a full user flow end-to-end.
//
// A true assertion that captured errors reach Sentry requires a live DSN and
// network egress and is out of scope for the suite; the init helper's no-op /
// initialize behavior is covered by the unit test in tests/unit-test/web/sentry.test.ts.
//
// The API+DB and Vite servers are started automatically on dedicated test ports
// by playwright.config.ts webServer (never the local :8080/:5173).

test('app renders and completes a basic flow with the Sentry ErrorBoundary in place', async ({ page }) => {
  // The unauthenticated app should land on the login screen, not the boundary
  // fallback.
  await page.goto('/login')
  await expect(page.getByText(/something went wrong/i)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible()

  // Exercise a real flow: register a new account and reach an authenticated
  // screen, proving the wrapped tree is fully interactive.
  const email = `sentry_${Date.now()}@example.com`
  await page.goto('/register')
  await page.getByLabel('Display name').fill('Sentry User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  await page.getByRole('link', { name: 'Workout' }).click()
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.getByText(/welcome back, sentry/i)).toBeVisible()

  // The boundary fallback must never have appeared during the flow.
  await expect(page.getByText(/something went wrong/i)).toHaveCount(0)
})
