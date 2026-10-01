import { test, expect } from '@playwright/test'

// E2E (PRD 0017): mid-session "Add exercise" opens the catalog picker (not a
// free-text box). Picking a movement adds a session-scoped, catalog-linked
// exercise you can log like a registered one. The picker is catalog-only here —
// no "Custom exercise" fallback. The API+DB and Vite servers start on dedicated
// test ports (see the config), never the local :8080/:5173.
//
// Run: (from apps/web) `npm run test:e2e`.

test('pick a catalog exercise mid-session and log a set', async ({ page }) => {
  const email = `midsession_${Date.now()}@example.com`

  // Register.
  await page.goto('/register')
  await page.getByLabel('Display name').fill('Mid Session')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  // Create a Pull Day routine with one exercise so a session can start.
  await page.getByRole('link', { name: 'Workout' }).click()
  await page.getByRole('button', { name: /new workout day/i }).click()
  await page.getByLabel('Workout day name').fill('Pull Day')
  await page.getByRole('button', { name: /add workout day/i }).click()
  await page.getByText('Pull Day').click()
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByRole('button', { name: /custom exercise/i }).click()
  await page.getByLabel('Name').fill('Barbell Row')
  await page.getByRole('button', { name: /save exercise/i }).click()
  await expect(page.getByText('Barbell Row')).toBeVisible()

  // Start the workout, then add Lat Pulldown on the spot from the catalog.
  await page.getByRole('button', { name: /start workout/i }).click()
  await expect(page.getByRole('button', { name: /stop/i })).toBeVisible()

  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  // Catalog-only mid-session: there is no free-text custom fallback.
  await expect(page.getByLabel('Search')).toBeVisible()
  await expect(page.getByRole('button', { name: /custom exercise/i })).toHaveCount(0)

  // Search + pick the movement, then confirm the targets.
  await page.getByLabel('Search').fill('Lat Pulldown')
  await page.getByRole('button', { name: 'Add Lat Pulldown' }).click()
  await page.getByRole('button', { name: /^add lat pulldown$/i }).click()

  // It appears in the checklist as a loggable row (catalog name + back badge).
  await expect(page.getByText('Lat Pulldown')).toBeVisible()

  // Log a set on the ad-hoc exercise — it behaves like a registered one.
  const card = page.locator('li.list-item', { hasText: 'Lat Pulldown' })
  await card.getByLabel('Lat Pulldown weight', { exact: true }).fill('50')
  await card.getByLabel('Lat Pulldown reps').fill('10')
  await card.getByRole('button', { name: /^log$/i }).click()
  await expect(page.getByText('50kg × 10')).toBeVisible()
})
