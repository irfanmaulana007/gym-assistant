import { test, expect, type Page } from '@playwright/test'

// E2E: PRD 0011 — the Profile screen's "Muscles trained" section renders a
// body diagram colored by training volume. Register → run a chest workout →
// open Profile → the diagram loads with the trained muscle in the layers, and
// switching the window keeps it working. No external network: the anatome
// request is intercepted and we assert the URL we build (not its rendering).
// Servers start on dedicated test ports (playwright.config.ts).

// A tiny valid 1x1 PNG so the <img> onLoad fires without touching the network.
const FAKE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

async function register(page: Page, tag: string) {
  const email = `${tag}_${Date.now()}@example.com`
  await page.goto('/register')
  await page.getByLabel('Display name').fill('Diagram User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()
  await expect(page).toHaveURL(/\/$/)
}

// Run one session of a routine, logging a single Bench Press set, then return to
// the workout list via the summary's Done button.
async function runSession(page: Page, routineName: string, weight: string) {
  await page.getByText(routineName).click()
  await page.getByRole('button', { name: /start workout/i }).click()
  await expect(page.getByLabel('Bench Press weight', { exact: true })).toBeVisible()
  await page.getByLabel('Bench Press weight', { exact: true }).fill(weight)
  await page.getByLabel('Bench Press reps').fill('8')
  await page.getByRole('button', { name: /^log$/i }).click()
  await expect(page.getByText('Set 1')).toBeVisible()
  await page.getByRole('button', { name: /stop/i }).click()
  await page.getByRole('button', { name: /save workout/i }).click()
  await expect(page.getByText(/workout complete/i)).toBeVisible()
  await page.getByRole('link', { name: /done/i }).click()
  await expect(page.getByText(routineName)).toBeVisible()
}

test('profile muscle-usage diagram reflects a trained muscle and survives a window switch', async ({ page }) => {
  const requestedUrls: string[] = []
  await page.route('**/generateImage**', async (route) => {
    requestedUrls.push(route.request().url())
    await route.fulfill({ contentType: 'image/png', body: FAKE_IMAGE })
  })

  await register(page, 'profile_muscle')

  // Create a Push Day with a custom Bench Press (defaults to chest), then train it.
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

  await page.getByRole('banner').getByRole('button', { name: /workout/i }).click()
  await runSession(page, 'Push Day', '60')

  // Open the Profile tab → the Muscles trained section renders the diagram.
  await page.getByRole('link', { name: 'Profile' }).click()
  await expect(page.getByText('Muscles trained')).toBeVisible()

  const img = page.getByRole('img', { name: /muscle-usage/i })
  await expect(img).toBeVisible()

  // The built URL targets anatome's generateImage; chest (the only trained group)
  // is in the top red tier.
  await expect.poll(() => requestedUrls.length).toBeGreaterThan(0)
  const layers = new URL(requestedUrls[requestedUrls.length - 1]).searchParams.get('layers')
  expect(layers).toContain('DC2626:chest')

  // The Less→More gradient legend is present.
  await expect(page.locator('.muscle-usage-legend')).toContainText('More')

  // Switch the window and the diagram still renders (this week includes today).
  await page.getByRole('tablist', { name: 'Muscle-usage time window' }).getByRole('tab', { name: 'Week' }).click()
  await expect(page.getByRole('img', { name: /muscle-usage/i })).toBeVisible()
})

test('profile muscle-usage diagram shows an empty state for an untrained user', async ({ page }) => {
  await page.route('**/generateImage**', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: FAKE_IMAGE })
  })

  await register(page, 'profile_muscle_empty')

  await page.getByRole('link', { name: 'Profile' }).click()
  await expect(page.getByText('Muscles trained')).toBeVisible()
  await expect(page.getByText('No muscles trained in this window yet.')).toBeVisible()
  await expect(page.getByRole('img', { name: /muscle-usage/i })).toHaveCount(0)
})
