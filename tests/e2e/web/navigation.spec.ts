import { test, expect } from '@playwright/test'

// E2E: native navigation chrome — the top-bar back chevron returns to the
// previous screen, and the Profile tab in the bottom navigation bar opens a
// full Profile screen that exposes the signed-in identity and the logout action.
// The API+DB and Vite servers are started automatically on dedicated test
// ports by playwright.config.ts webServer (never the local :8080/:5173).
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

  // Home is a top-level tab screen, so the nav bar carries no header title —
  // only child screens (pushed with a back chevron) show one.
  await expect(page.getByRole('banner').getByRole('heading', { name: 'Workouts' })).toHaveCount(0)

  // Create and open a routine (the form opens in a modal/bottom-sheet).
  await page.getByRole('button', { name: /new workout day/i }).click()
  await page.getByLabel('Workout day name').fill('Leg Day')
  await page.getByRole('button', { name: /add workout day/i }).click()
  await page.getByText('Leg Day').click()

  // The detail screen is a child screen, so it shows the routine name as the nav title.
  await expect(page.getByRole('heading', { name: 'Leg Day' })).toBeVisible()

  // Tap the back chevron → back on the workouts home.
  await page.getByRole('button', { name: /workouts/i }).click()
  await expect(page.getByText(/welcome back, nav/i)).toBeVisible()
})

test('profile tab opens the profile screen with identity and logout', async ({ page }) => {
  const email = `profile_${Date.now()}@example.com`

  await page.goto('/register')
  await page.getByLabel('Display name').fill('Profile User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  await expect(page.getByText(/welcome back, profile/i)).toBeVisible()

  // The header carries no account button — the account lives in the bottom tab bar.
  await expect(page.getByRole('banner').getByRole('button')).toHaveCount(0)

  // Tapping the Profile tab in the bottom nav navigates to a full Profile screen.
  await page.getByRole('link', { name: 'Profile' }).click()
  await expect(page).toHaveURL(/\/profile$/)
  // Profile is a top-level tab screen: no header title, its identity lives in the
  // page body (avatar + name + the account rows below).
  await expect(page.getByRole('banner').getByRole('heading', { name: 'Profile' })).toHaveCount(0)
  await expect(page.getByText(email).first()).toBeVisible()

  // The Profile screen is a root tab, so it has no back chevron.
  await expect(page.getByRole('button', { name: 'Workouts' })).toHaveCount(0)

  // Logout lives on the profile screen and returns to the login screen.
  await page.getByRole('button', { name: /logout/i }).click()
  await expect(page).toHaveURL(/\/login$/)
})
