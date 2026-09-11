import { test, expect } from '@playwright/test'

// E2E: the exercise detail page splits into Info / Progress / History tabs.
// register → create a routine → add a custom exercise → open its detail →
// verify the Info tab (muscles, target, source) is default, then switch tabs.
// Requires the API running at VITE_API_BASE_URL and the Vite dev server.

test('exercise detail shows Info/Progress/History tabs', async ({ page }) => {
  const email = `detailtabs_${Date.now()}@example.com`

  // Register.
  await page.goto('/register')
  await page.getByLabel('Display name').fill('Tabs User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  // Create a routine and open it.
  await page.getByRole('button', { name: /new workout day/i }).click()
  await page.getByLabel('Workout day name').fill('Push Day')
  await page.getByRole('button', { name: /add workout day/i }).click()
  await page.getByText('Push Day').click()

  // Add a custom exercise (defaults: Chest, Weight × reps, 3×12).
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByRole('button', { name: /custom exercise/i }).click()
  await page.getByLabel('Name').fill('Overhead Press')
  await page.getByRole('button', { name: /save exercise/i }).click()
  await expect(page.getByText('Overhead Press')).toBeVisible()

  // Open the exercise detail page.
  await page.getByText('Overhead Press').click()

  // All three tabs are present.
  await expect(page.getByRole('tab', { name: 'Info' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Progress' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'History' })).toBeVisible()

  // Info tab is the default: muscles worked, measurement, target, source.
  await expect(page.getByRole('tab', { name: 'Info' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Chest')).toBeVisible()
  await expect(page.getByText('Weight × reps')).toBeVisible()
  await expect(page.getByText('3×12')).toBeVisible()
  await expect(page.getByText('Custom')).toBeVisible()

  // History tab → empty state (nothing logged yet).
  await page.getByRole('tab', { name: 'History' }).click()
  await expect(page.getByText(/no logged sessions yet/i)).toBeVisible()

  // Progress tab → progression card (not enough data with no sessions).
  await page.getByRole('tab', { name: 'Progress' }).click()
  await expect(page.getByText(/not enough data yet/i)).toBeVisible()
})
