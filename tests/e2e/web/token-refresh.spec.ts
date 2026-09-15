import { test, expect } from '@playwright/test'

// E2E (PRD 0010): a session whose access token has gone stale but still holds a
// valid refresh token must recover silently — the app transparently refreshes
// and stays authenticated instead of bouncing to /login.
//
// The API+DB and Vite servers start automatically on dedicated test ports
// (playwright.config.ts webServer) — never the local :8080/:5173.
//
// Run: (from apps/web) `npm run test:e2e`.

test('a stale access token is silently refreshed instead of forcing re-login', async ({ page }) => {
  const unique = Date.now()
  const email = `e2e_refresh_${unique}@example.com`

  // Register — this stores both a valid access token and a valid refresh token.
  await page.goto('/register')
  await page.getByLabel('Display name').fill('E2E Refresh')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()
  await expect(page).toHaveURL(/\/$/)

  // Sanity: both tokens are present.
  const refreshToken = await page.evaluate(() => localStorage.getItem('gym.refreshToken'))
  const originalAccess = await page.evaluate(() => localStorage.getItem('gym.token'))
  expect(refreshToken).toBeTruthy()
  expect(originalAccess).toBeTruthy()

  // Simulate an expired access token by corrupting it, while keeping the valid
  // refresh token — exactly the state a returning user hits after the access
  // token lapses.
  await page.evaluate(() => localStorage.setItem('gym.token', 'invalid.expired.token'))

  // Reload: hydrating the session (GET /auth/me) 401s on the bogus token, the
  // client refreshes transparently, and the authenticated home renders — no
  // bounce to /login.
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible()

  // The stale access token was replaced by a freshly-minted one.
  const newAccess = await page.evaluate(() => localStorage.getItem('gym.token'))
  expect(newAccess).toBeTruthy()
  expect(newAccess).not.toBe('invalid.expired.token')
})
