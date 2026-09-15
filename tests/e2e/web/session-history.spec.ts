import { test, expect } from '@playwright/test'

// E2E: PRD 0013 + PRD 0015.
//  - After finishing a workout the summary shows a body heatmap of the muscles
//    worked; the History tab lists past sessions.
//  - The post-finish summary is the *celebratory* variant ("Workout complete",
//    a Done button); reopening the same session from History is the *history*
//    variant (titled with the workout group, no encouragement, no Done).
//  - When the session contains cardio, an "Include cardio" toggle appears on the
//    heatmap and flips state.
// The anatome request is intercepted so the test never touches the external
// service. API + Vite servers start on dedicated test ports (see
// playwright.config.ts).

// A tiny valid 1x1 PNG so the <img> onLoad fires without touching the network.
const FAKE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

test('finish a session, toggle cardio, then reopen it from History as the history variant', async ({ page }) => {
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

  // Add a cardio exercise so the "Include cardio" toggle has something to hide.
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByRole('button', { name: /custom exercise/i }).click()
  await page.getByLabel('Name').fill('Treadmill')
  await page.getByLabel('Primary muscle group').selectOption('cardio')
  await page.getByRole('button', { name: /save exercise/i }).click()
  await expect(page.getByText('Treadmill')).toBeVisible()

  // Run the session: log one strength set and save.
  await page.getByRole('button', { name: /start workout/i }).click()
  await expect(page.getByRole('button', { name: /stop/i })).toBeVisible()
  await page.getByLabel('Bench Press weight', { exact: true }).fill('60')
  await page.getByLabel('Bench Press reps').fill('8')
  // Two exercises → two "Log" buttons; scope to the Bench Press card.
  const benchCard = page.locator('li.list-item', { hasText: 'Bench Press' })
  await benchCard.getByRole('button', { name: /^log$/i }).click()
  await expect(page.getByText('Set 1')).toBeVisible()
  await page.getByRole('button', { name: /stop/i }).click()
  await page.getByRole('button', { name: /save workout/i }).click()

  // Post-finish = the celebratory "complete" variant: title, encouragement, Done.
  await expect(page.getByText(/workout complete/i)).toBeVisible()
  await expect(page.getByRole('link', { name: /done/i })).toBeVisible()
  const summaryImg = page.getByRole('img', { name: /muscle-usage body diagram/i })
  await expect(summaryImg).toBeVisible()
  expect(requestedUrl).toContain('/generateImage')
  expect(new URL(requestedUrl).searchParams.get('layers')).toContain('chest')

  // The cardio session shows the "Include cardio" toggle, defaulting to off.
  const cardioToggle = page.getByRole('switch', { name: /include cardio/i })
  await expect(cardioToggle).toBeVisible()
  await expect(cardioToggle).toHaveAttribute('aria-checked', 'false')
  await cardioToggle.click()
  await expect(cardioToggle).toHaveAttribute('aria-checked', 'true')

  // Return to Workout, open the History tab — the finished session is listed.
  await page.getByRole('link', { name: /done/i }).click()
  await page.getByRole('link', { name: 'History' }).click()
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
  const row = page.getByRole('link').filter({ hasText: 'Push Day' })
  await expect(row).toBeVisible()

  // Opening it from History = the "history" variant: titled with the workout
  // group, no "Workout complete", no Done — but the same summary + heatmap.
  await row.click()
  await expect(page.getByRole('heading', { name: 'Push Day' })).toBeVisible()
  await expect(page.getByText(/workout complete/i)).toHaveCount(0)
  await expect(page.getByRole('link', { name: /done/i })).toHaveCount(0)
  await expect(page.getByText(/total volume/i)).toBeVisible()
  await expect(page.getByRole('img', { name: /muscle-usage body diagram/i })).toBeVisible()
})
