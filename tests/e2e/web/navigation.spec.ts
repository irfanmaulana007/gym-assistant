import { test, expect } from '@playwright/test'

// E2E: native navigation chrome — the top-bar back chevron returns to the
// previous screen, and the account menu exposes the signed-in identity.
// Requires the API running at VITE_API_BASE_URL and the Vite dev server
// (started by playwright.config.ts webServer).
//
// Run: (from apps/web) `npm run test:e2e` with the API up.

test('back chevron returns from routine detail to the workouts home', async ({ page }) => {
  const email = `nav_${Date.now()}@example.com`

  await page.goto('/register')
  await page.getByLabel('Display name').fill('Nav User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  // Home shows the personalized greeting.
  await expect(page.getByText(/welcome back, nav/i)).toBeVisible()

  // Create and open a routine (the form opens in a modal/bottom-sheet).
  await page.getByRole('button', { name: /new workout day/i }).click()
  await page.getByLabel('Workout day name').fill('Leg Day')
  await page.getByRole('button', { name: /add workout day/i }).click()
  await page.getByText('Leg Day').click()

  // The detail screen shows the routine name as the nav title.
  await expect(page.getByRole('heading', { name: 'Leg Day' })).toBeVisible()

  // Tap the back chevron → back on the workouts home.
  await page.getByRole('button', { name: /workouts/i }).click()
  await expect(page.getByText(/welcome back, nav/i)).toBeVisible()
})

test('account menu shows the signed-in email', async ({ page }) => {
  const email = `menu_${Date.now()}@example.com`

  await page.goto('/register')
  await page.getByLabel('Display name').fill('Menu User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  await page.getByRole('button', { name: /account menu/i }).click()
  await expect(page.getByText(email)).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /logout/i })).toBeVisible()
})
