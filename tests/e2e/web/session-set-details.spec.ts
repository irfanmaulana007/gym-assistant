import { test, expect } from '@playwright/test'

// E2E: log a workout with sets that vary set-to-set, then verify the per-set
// detail can be expanded in two places:
//   1. the post-workout summary (Exercises section), and
//   2. the exercise detail page's History tab.
// The collapsed views only show a top-set summary; expanding must reveal every
// logged set (weight × reps). The anatome image request is stubbed so the test
// never touches the external service. API + Vite servers start on dedicated test
// ports (see playwright.config.ts).

// A tiny valid 1x1 PNG so the muscle-diagram <img> loads without the network.
const FAKE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

test('expand per-set detail in the workout summary and exercise history', async ({ page }) => {
  await page.route('**/generateImage**', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: FAKE_IMAGE })
  })

  const email = `setdetails_${Date.now()}@example.com`

  // Register.
  await page.goto('/register')
  await page.getByLabel('Display name').fill('Sets User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  // Create a routine + a (Chest-default) custom exercise.
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

  // Run the session: log two sets with different weights/reps, then save.
  await page.getByRole('button', { name: /start workout/i }).click()
  await expect(page.getByRole('button', { name: /stop/i })).toBeVisible()

  await page.getByLabel('Bench Press weight', { exact: true }).fill('60')
  await page.getByLabel('Bench Press reps').fill('8')
  await page.getByRole('button', { name: /^log$/i }).click()
  await expect(page.getByText('Set 1')).toBeVisible()

  await page.getByLabel('Bench Press weight', { exact: true }).fill('62.5')
  await page.getByLabel('Bench Press reps').fill('6')
  await page.getByRole('button', { name: /^log$/i }).click()
  await expect(page.getByText('Set 2')).toBeVisible()

  await page.getByRole('button', { name: /stop/i }).click()
  await page.getByRole('button', { name: /save workout/i }).click()

  // Post-finish summary: the Exercises section shows a collapsed one-line summary.
  await expect(page.getByText(/workout complete/i)).toBeVisible()
  const summaryLine = page.getByText(/2 sets · top 62\.5kg/)
  await expect(summaryLine).toBeVisible()
  // Individual sets are hidden until expanded.
  await expect(page.getByText('60kg × 8')).toBeHidden()

  // Expand the exercise → every logged set is revealed, including the one that
  // differs from the top set.
  await page.getByRole('button', { name: /show sets for bench press/i }).click()
  await expect(page.getByText('60kg × 8')).toBeVisible()
  await expect(page.getByText('62.5kg × 6')).toBeVisible()

  // Now the exercise detail History tab: open the exercise and its History tab.
  await page.getByRole('link', { name: /done/i }).click()
  await page.getByText('Push Day').click()
  await page.getByText('Bench Press').click()
  await page.getByRole('tab', { name: 'History' }).click()

  // Collapsed: session summary line shows, sets hidden.
  await expect(page.getByText(/2 sets/)).toBeVisible()
  await expect(page.locator('.entry-row')).toHaveCount(0)

  // Expand the session → each set is revealed. Scope to the set pills so we
  // don't collide with the top-set summary (which repeats the top set's value).
  await page.getByRole('button', { name: /show sets from/i }).click()
  await expect(page.locator('.entry-row', { hasText: '60kg × 8' })).toBeVisible()
  await expect(page.locator('.entry-row', { hasText: '62.5kg × 6' })).toBeVisible()
})
