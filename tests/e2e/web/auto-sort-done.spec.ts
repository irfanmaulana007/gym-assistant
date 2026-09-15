import { test, expect } from '@playwright/test'

// E2E: during an active workout, marking an exercise done should sink it to the
// bottom of the list so the remaining (not-done) exercises stay on top. The
// API+DB and Vite servers start automatically on dedicated test ports (see the
// config) — never the local :8080/:5173.
//
// Run: (from apps/web) `npm run test:e2e`.

test('marking an exercise done moves it below the not-done exercises', async ({ page }) => {
  const email = `sort_${Date.now()}@example.com`

  // Register.
  await page.goto('/register')
  await page.getByLabel('Display name').fill('Sort User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  // Create a routine with two exercises, in a known order.
  await page.getByRole('link', { name: 'Workout' }).click()
  await page.getByRole('button', { name: /new workout day/i }).click()
  await page.getByLabel('Workout day name').fill('Push Day')
  await page.getByRole('button', { name: /add workout day/i }).click()
  await page.getByText('Push Day').click()

  for (const name of ['Bench Press', 'Incline Press']) {
    await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
    await page.getByRole('button', { name: /custom exercise/i }).click()
    await page.getByLabel('Name').fill(name)
    await page.getByRole('button', { name: /save exercise/i }).click()
    await expect(page.getByText(name)).toBeVisible()
  }

  // Start the workout — both exercises show in position order.
  await page.getByRole('button', { name: /start workout/i }).click()
  await expect(page.getByRole('button', { name: /stop/i })).toBeVisible()

  const names = page.locator('li.list-item[data-flip-key] strong')
  await expect(names).toHaveText(['Bench Press', 'Incline Press'])

  // Mark the first exercise (Bench Press) as done.
  await page.getByRole('button', { name: 'Mark Bench Press done' }).click()

  // It sinks to the bottom; the still-pending Incline Press rises to the top.
  await expect(names).toHaveText(['Incline Press', 'Bench Press'])

  // Un-marking it restores it above the not-done group (stable position order).
  await page.getByRole('button', { name: 'Mark Bench Press not done' }).click()
  await expect(names).toHaveText(['Bench Press', 'Incline Press'])
})
