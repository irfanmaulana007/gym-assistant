import { test, expect } from '@playwright/test'

// E2E: native navigation chrome — the top-bar back chevron returns to the
// previous screen, and the avatar pushes a full Profile screen (no dropdown)
// that exposes the signed-in identity and the logout action.
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

  // Create and open a routine.
  await page.getByLabel('New workout day').fill('Leg Day')
  await page.getByRole('button', { name: /add workout day/i }).click()
  await page.getByText('Leg Day').click()

  // The detail screen shows the routine name as the nav title.
  await expect(page.getByRole('heading', { name: 'Leg Day' })).toBeVisible()

  // Tap the back chevron → back on the workouts home.
  await page.getByRole('button', { name: /workouts/i }).click()
  await expect(page.getByText(/welcome back, nav/i)).toBeVisible()
})

test('avatar opens the profile screen with identity and logout', async ({ page }) => {
  const email = `profile_${Date.now()}@example.com`

  await page.goto('/register')
  await page.getByLabel('Display name').fill('Profile User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  await expect(page.getByText(/welcome back, profile/i)).toBeVisible()

  // Tapping the avatar navigates to a full Profile screen (not a dropdown).
  await page.getByRole('button', { name: /^profile$/i }).click()
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
  // Email shows in both the header subtitle and the account detail row.
  await expect(page.getByText(email).first()).toBeVisible()

  // Logout lives on the profile screen and returns to the login screen.
  await page.getByRole('button', { name: /logout/i }).click()
  await expect(page).toHaveURL(/\/login$/)
})
