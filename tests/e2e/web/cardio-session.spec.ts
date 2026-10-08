import { test, expect } from '@playwright/test'

// E2E (PRD 0019): a distance/running exercise must work inside a session —
// its distance target shows on the checklist (not "—"), the logging inputs are
// distance/duration/HR (not kg × reps), pace is derived live, and a logged run
// round-trips with its distance, pace, and heart rate. API + Vite servers start
// on dedicated test ports (see playwright.config.ts).

// A tiny valid 1x1 PNG so any muscle-diagram <img> loads without the network.
const FAKE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

test('log a distance run with pace and heart rate during a session', async ({ page }) => {
  await page.route('**/generateImage**', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: FAKE_IMAGE })
  })

  const email = `cardio_${Date.now()}@example.com`

  // Register.
  await page.goto('/register')
  await page.getByLabel('Display name').fill('Cardio User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  // Create a routine + a custom distance exercise with a 5 km target.
  await page.getByRole('link', { name: 'Workout' }).click()
  await page.getByRole('button', { name: /new workout day/i }).click()
  await page.getByLabel('Workout day name').fill('Conditioning')
  await page.getByRole('button', { name: /add workout day/i }).click()
  await page.getByText('Conditioning').click()
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByRole('button', { name: /custom exercise/i }).click()
  await page.getByLabel('Name').fill('Morning Run')
  await page.getByLabel('Type').selectOption('distance')
  await page.getByLabel('Target distance').fill('5')
  await page.getByLabel('Unit').selectOption('km')
  await page.getByRole('button', { name: /save exercise/i }).click()
  await expect(page.getByText('Morning Run')).toBeVisible()

  // Start the session: the checklist must show the 5 km target, not a dash.
  await page.getByRole('button', { name: /start workout/i }).click()
  await expect(page.getByRole('button', { name: /stop/i })).toBeVisible()
  await expect(page.getByText(/Target\s*5km/)).toBeVisible()

  // The logging inputs are distance/duration/HR — the weight/reps inputs must not exist.
  await expect(page.getByLabel('Morning Run distance', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Morning Run weight', { exact: true })).toHaveCount(0)

  // Enter distance + duration → pace is derived live (5 km in 27:30 → 5:30 /km).
  await page.getByLabel('Morning Run distance', { exact: true }).fill('5')
  await page.getByLabel('Morning Run minutes').fill('27.5')
  await expect(page.getByText('Pace 5:30 /km')).toBeVisible()

  // Add a heart rate and log the run.
  await page.getByLabel('Morning Run average heart rate').fill('150')
  await page.getByRole('button', { name: /^log$/i }).click()

  // The logged bout shows distance, pace, and heart rate.
  await expect(page.getByText('Set 1')).toBeVisible()
  await expect(page.locator('.entry-row', { hasText: '5:30 /km' })).toBeVisible()
  await expect(page.locator('.entry-row', { hasText: '♥150' })).toBeVisible()
})
