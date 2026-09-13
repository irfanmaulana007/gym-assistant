import { test, expect } from '@playwright/test'

// E2E for the "resume running session" surface (PRD 0002 lifecycle):
// a persistent banner on the top-level tab screens links back into a session
// that is still active, and starting a second session (409) offers to resume
// the running one instead. The API+DB and Vite servers start automatically on
// dedicated test ports (see the config) — never the local :8080/:5173.
//
// Run: (from apps/web) `npm run test:e2e`.

async function registerAndStart(page: import('@playwright/test').Page, name: string) {
  const email = `resume_${name}_${Date.now()}@example.com`
  await page.goto('/register')
  await page.getByLabel('Display name').fill('Resume User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  await page.getByRole('link', { name: 'Workout' }).click()
  await page.getByRole('button', { name: /new workout day/i }).click()
  await page.getByLabel('Workout day name').fill('Push Day')
  await page.getByRole('button', { name: /add workout day/i }).click()
  await page.getByText('Push Day').click()

  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByRole('button', { name: /custom exercise/i }).click()
  await page.getByLabel('Name').fill('Bench Press')
  await page.getByRole('button', { name: /save exercise/i }).click()
  await expect(page.getByText('Bench Press')).toBeVisible()

  await page.getByRole('button', { name: /start workout/i }).click()
  await expect(page.getByRole('button', { name: /stop/i })).toBeVisible()
}

test('resume banner on a tab screen jumps back into the running session', async ({ page }) => {
  await registerAndStart(page, 'banner')

  // Leave the session for a top-level tab — as if reopening the app while the
  // session is still active server-side. The persistent banner appears there.
  await page.goto('/')
  const banner = page.getByRole('link', { name: /resume your active workout/i })
  await expect(banner).toBeVisible()
  await expect(page.getByText(/workout in progress/i)).toBeVisible()

  // Tapping it returns to the session (Stop is only on the active-session page).
  await banner.click()
  await expect(page.getByRole('button', { name: /stop/i })).toBeVisible()

  // Once discarded, the banner is gone on the tab screens.
  await page.getByRole('button', { name: /stop/i }).click()
  await page.getByRole('button', { name: /discard workout/i }).click()
  await page.goto('/')
  await expect(page.getByRole('link', { name: /resume your active workout/i })).toHaveCount(0)
})

test('starting a second workout offers to resume the running one (409)', async ({ page }) => {
  await registerAndStart(page, 'conflict')

  // Go back to the routine and try to start again — the API allows only one
  // live session, so the CTA becomes "Resume current workout".
  await page.goto('/workout')
  await page.getByText('Push Day').click()
  await page.getByRole('button', { name: /start workout/i }).click()

  const resume = page.getByRole('button', { name: /resume current workout/i })
  await expect(resume).toBeVisible()
  await resume.click()
  await expect(page.getByRole('button', { name: /stop/i })).toBeVisible()
})
