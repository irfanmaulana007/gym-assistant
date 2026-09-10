import { test, expect } from '@playwright/test'

// E2E: the auth flow in a real browser (mobile viewport). The API+DB and Vite
// servers start automatically on dedicated test ports (playwright.config.ts
// webServer) — never the local :8080/:5173. Registers a unique user, then
// verifies the authenticated home renders.
//
// Run: (from apps/web) `npm run test:e2e`.

test('register then land on authenticated home', async ({ page }) => {
  const unique = Date.now()
  const email = `e2e_${unique}@example.com`

  await page.goto('/register')

  await page.getByLabel('Display name').fill('E2E User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  // Lands on the authenticated home with a welcome greeting and the account
  // avatar in the top-right nav bar.
  await expect(page.getByText(/welcome/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /^profile$/i })).toBeVisible()
})

test('logging out returns to login', async ({ page }) => {
  const unique = Date.now()
  const email = `e2e_out_${unique}@example.com`

  await page.goto('/register')
  await page.getByLabel('Display name').fill('E2E Out')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  // Logout lives on the full Profile screen (native pattern) — the avatar in
  // the nav bar navigates there instead of opening a dropdown.
  await page.getByRole('button', { name: /^profile$/i }).click()
  await page.getByRole('button', { name: /logout/i }).click()
  await expect(page.getByRole('button', { name: /^log in$/i })).toBeVisible()
})
