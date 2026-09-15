import { test, expect } from '@playwright/test'

// E2E: PRD 0012 — after finishing a workout the summary shows a body heatmap of
// the muscles worked; the History tab lists past sessions; opening one shows the
// same summary (with the heatmap) as right after finishing. The anatome request
// is intercepted so the test never touches the external service — we assert the
// image renders and the layers we build. API + Vite servers start on dedicated
// test ports (see playwright.config.ts).

// A tiny valid 1x1 PNG so the <img> onLoad fires without touching the network.
const FAKE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

test('finish a session, see the heatmap, then reopen it from History', async ({ page }) => {
  let requestedUrl = ''
  await page.route('**/generateImage**', async (route) => {
    requestedUrl = route.request().url()
    await route.fulfill({ contentType: 'image/png', body: FAKE_IMAGE })
  })

  const email = `history_${Date.now()}@example.com`

  // Register.
  await page.goto('/register')
  await page.getByLabel('Display name').fill('History User')
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

  // Run the session: log one set and save.
  await page.getByRole('button', { name: /start workout/i }).click()
  await expect(page.getByRole('button', { name: /stop/i })).toBeVisible()
  await page.getByLabel('Bench Press weight', { exact: true }).fill('60')
  await page.getByLabel('Bench Press reps').fill('8')
  await page.getByRole('button', { name: /^log$/i }).click()
  await expect(page.getByText('Set 1')).toBeVisible()
  await page.getByRole('button', { name: /stop/i }).click()
  await page.getByRole('button', { name: /save workout/i }).click()

  // Post-finish summary: the body heatmap renders alongside the metrics.
  await expect(page.getByText(/workout complete/i)).toBeVisible()
  const summaryImg = page.getByRole('img', { name: /muscle-usage body diagram/i })
  await expect(summaryImg).toBeVisible()
  expect(requestedUrl).toContain('/generateImage')
  expect(new URL(requestedUrl).searchParams.get('layers')).toContain('chest')

  // Return to Workout, open the History tab — the finished session is listed.
  await page.getByRole('link', { name: /done/i }).click()
  await page.getByRole('link', { name: 'History' }).click()
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
  const row = page.getByRole('link').filter({ hasText: 'Chest' })
  await expect(row).toBeVisible()

  // Opening the history entry shows the same summary + heatmap.
  await row.click()
  await expect(page.getByText(/workout complete/i)).toBeVisible()
  await expect(page.getByText(/total volume/i)).toBeVisible()
  await expect(page.getByRole('img', { name: /muscle-usage body diagram/i })).toBeVisible()
})
