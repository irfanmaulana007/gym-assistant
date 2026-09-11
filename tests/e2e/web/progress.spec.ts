import { test, expect, type Page } from '@playwright/test'

// E2E (PRD 0007): register → run two workouts (increasing weight) → open the
// Progress tab → see non-zero workouts/volume and a muscle-group breakdown →
// switch the window → tap a trending exercise and land on its history page.
// The API+DB and Vite servers start on dedicated test ports (see the config).

async function register(page: Page, email: string) {
  await page.goto('/register')
  await page.getByLabel('Display name').fill('Progress User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()
}

async function runSession(page: Page, routineName: string, weight: string) {
  await page.goto('/')
  await page.getByText(routineName).click()
  await page.getByRole('button', { name: /start workout/i }).click()
  await expect(page.getByLabel('Bench Press weight')).toBeVisible()
  await page.getByLabel('Bench Press weight').fill(weight)
  await page.getByLabel('Bench Press reps').fill('8')
  await page.getByRole('button', { name: /^log$/i }).click()
  await expect(page.getByText('Set 1')).toBeVisible()
  await page.getByRole('button', { name: /stop/i }).click()
  await page.getByRole('button', { name: /save workout/i }).click()
  await expect(page.getByText(/workout complete/i)).toBeVisible()
}

test('progress dashboard shows aggregates and links a trending exercise to its history', async ({ page }) => {
  const email = `progress_${Date.now()}@example.com`
  await register(page, email)

  // Create a routine + a chest exercise (the custom form defaults to chest).
  await page.getByRole('button', { name: /new workout day/i }).click()
  await page.getByLabel('Workout day name').fill('Push Day')
  await page.getByRole('button', { name: /add workout day/i }).click()
  await page.getByText('Push Day').click()
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByRole('button', { name: /custom exercise/i }).click()
  await page.getByLabel('Name').fill('Bench Press')
  await page.getByRole('button', { name: /save exercise/i }).click()
  await expect(page.getByText('Bench Press')).toBeVisible()

  // Two sessions with rising top-set weight so the exercise trends up.
  await runSession(page, 'Push Day', '60')
  await runSession(page, 'Push Day', '62.5')

  // Open the Progress tab from the bottom nav.
  await page.goto('/')
  await page.getByRole('link', { name: 'Progress' }).click()
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()

  // Summary: two workouts and non-zero volume.
  await expect(page.locator('.stat', { hasText: 'Workouts' }).locator('.stat-value')).toHaveText('2')
  const volume = page.locator('.stat', { hasText: 'Volume' }).locator('.stat-value')
  await expect(volume).toBeVisible()
  await expect(volume).not.toHaveText('0')

  // Muscle-group breakdown includes Chest.
  await expect(page.getByText('Chest')).toBeVisible()

  // Switch the window and the dashboard still renders (week includes today's
  // sessions).
  await page.getByRole('tab', { name: 'Week' }).click()
  await expect(page.locator('.stat', { hasText: 'Workouts' }).locator('.stat-value')).toHaveText('2')

  // Progress signals: Bench Press trends up; tapping it lands on its history.
  await page.getByRole('tab', { name: 'All' }).click()
  await page.getByRole('link', { name: /Bench Press/ }).first().click()
  await expect(page).toHaveURL(/\/exercises\/.+\/history/)
  await expect(page.getByRole('tab', { name: 'History' })).toBeVisible()
})

test('a brand-new user sees an encouraging empty progress state', async ({ page }) => {
  const email = `progress_empty_${Date.now()}@example.com`
  await register(page, email)

  await page.getByRole('link', { name: 'Progress' }).click()
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()
  await expect(page.getByText('No progress yet.')).toBeVisible()
})
