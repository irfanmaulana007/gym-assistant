import { test, expect } from '@playwright/test'

// E2E: native navigation chrome — the top-bar back chevron returns to the
// previous screen, and the Profile tab in the bottom navigation bar opens a
// full Profile screen that exposes the signed-in identity and the logout action.
// Per PRD 0007, Progress is the landing tab at `/` and the workout-days list
// lives on the Workout tab at `/workout`.
//
// The API+DB and Vite servers are started automatically on dedicated test ports
// by playwright.config.ts webServer (never the local :8080/:5173).
//
// Run: (from apps/web) `npm run test:e2e` with the API up.

test('back chevron returns from routine detail to the workout home', async ({ page }) => {
  const email = `nav_${Date.now()}@example.com`

  await page.goto('/register')
  await page.getByLabel('Display name').fill('Nav User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  // Registration lands on Progress; open the Workout tab from the bottom nav.
  await page.getByRole('link', { name: 'Workout' }).click()
  await expect(page).toHaveURL(/\/workout$/)

  // Workout home shows the personalized greeting and, being a top-level tab
  // screen, carries no header (only child screens show one).
  await expect(page.getByText(/welcome back, nav/i)).toBeVisible()
  await expect(page.getByRole('banner')).toHaveCount(0)

  // Create and open a routine (the form opens in a modal/bottom-sheet).
  await page.getByRole('button', { name: /new workout day/i }).click()
  await page.getByLabel('Workout day name').fill('Leg Day')
  await page.getByRole('button', { name: /add workout day/i }).click()
  await page.getByText('Leg Day').click()

  // The detail screen is a child screen, so it shows the routine name as the nav title.
  await expect(page.getByRole('heading', { name: 'Leg Day' })).toBeVisible()

  // Tap the back chevron (in the header) → back on the workout home.
  await page.getByRole('banner').getByRole('button', { name: /workout/i }).click()
  await expect(page.getByText(/welcome back, nav/i)).toBeVisible()
})

test('profile tab opens the profile screen with identity and logout', async ({ page }) => {
  const email = `profile_${Date.now()}@example.com`

  await page.goto('/register')
  await page.getByLabel('Display name').fill('Profile User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  // Registration lands on Progress (the landing tab): top-level, so no header.
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()
  await expect(page.getByRole('banner')).toHaveCount(0)

  // Tapping the Profile tab in the bottom nav navigates to a full Profile screen.
  await page.getByRole('link', { name: 'Profile' }).click()
  await expect(page).toHaveURL(/\/profile$/)
  // Profile is a top-level tab screen: no header title, its identity lives in the
  // page body (avatar + name + the account rows below).
  await expect(page.getByRole('banner')).toHaveCount(0)
  await expect(page.getByText(email).first()).toBeVisible()

  // Logout lives on the profile screen and returns to the login screen.
  await page.getByRole('button', { name: /logout/i }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('top-level screens render no header element (no blank strip); child screens do', async ({ page }) => {
  const email = `header_${Date.now()}@example.com`

  await page.goto('/register')
  await page.getByLabel('Display name').fill('Header User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  // Progress (landing) is top-level: the empty nav bar is omitted entirely, so
  // there is NO <header> (banner) taking up a blank strip at the top.
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()
  await expect(page.getByRole('banner')).toHaveCount(0)

  // The Workout tab is also top-level — still no header.
  await page.getByRole('link', { name: 'Workout' }).click()
  await expect(page.getByText(/welcome back, header/i)).toBeVisible()
  await expect(page.getByRole('banner')).toHaveCount(0)

  // Open a child screen — it IS pushed with a back chevron, so the header exists.
  await page.getByRole('button', { name: /new workout day/i }).click()
  await page.getByLabel('Workout day name').fill('Leg Day')
  await page.getByRole('button', { name: /add workout day/i }).click()
  await page.getByText('Leg Day').click()

  await expect(page.getByRole('banner')).toHaveCount(1)
  await expect(page.getByRole('banner').getByRole('heading', { name: 'Leg Day' })).toBeVisible()

  // Back on the top-level workout home, the header is gone again.
  await page.getByRole('banner').getByRole('button', { name: /workout/i }).click()
  await expect(page.getByText(/welcome back, header/i)).toBeVisible()
  await expect(page.getByRole('banner')).toHaveCount(0)
})
