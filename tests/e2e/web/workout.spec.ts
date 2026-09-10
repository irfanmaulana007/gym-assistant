import { test, expect } from '@playwright/test'

// E2E happy path (PRD 0001/0002): register → create a routine → add an exercise
// → start a session → log a set → complete → see the summary. Requires the API
// running at VITE_API_BASE_URL and the Vite dev server (started by the config).
//
// Run: (from apps/web) `npm run test:e2e` with the API up.

test('create routine, add exercise, run a session, see summary', async ({ page }) => {
  const email = `flow_${Date.now()}@example.com`

  // Register.
  await page.goto('/register')
  await page.getByLabel('Display name').fill('Flow User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  // Create a routine (the form opens in a modal/bottom-sheet).
  await page.getByRole('button', { name: /new workout day/i }).click()
  await page.getByLabel('Workout day name').fill('Push Day')
  await page.getByRole('button', { name: /add workout day/i }).click()
  await page.getByText('Push Day').click()

  // Add an exercise (also via the sheet).
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Name').fill('Bench Press')
  await page.getByRole('button', { name: /save exercise/i }).click()
  await expect(page.getByText('Bench Press')).toBeVisible()

  // Start the workout.
  await page.getByRole('button', { name: /start workout/i }).click()
  await expect(page.getByText(/active workout/i)).toBeVisible()

  // Log a set: 60kg × 8.
  await page.getByLabel('Bench Press weight').fill('60')
  await page.getByLabel('Bench Press reps').fill('8')
  await page.getByRole('button', { name: /^log$/i }).click()
  await expect(page.getByText('Set 1')).toBeVisible()

  // Stop opens a Save/Discard sheet (guards against an accidental tap). Save it
  // and see the summary.
  await page.getByRole('button', { name: /stop/i }).click()
  await expect(page.getByRole('button', { name: /save workout/i })).toBeVisible()
  await page.getByRole('button', { name: /save workout/i }).click()

  await expect(page.getByText(/workout complete/i)).toBeVisible()
  await expect(page.getByText(/total volume/i)).toBeVisible()
})

test('stop then discard abandons the session and redirects home', async ({ page }) => {
  const email = `discard_${Date.now()}@example.com`

  await page.goto('/register')
  await page.getByLabel('Display name').fill('Discard User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  await page.getByRole('button', { name: /new workout day/i }).click()
  await page.getByLabel('Workout day name').fill('Leg Day')
  await page.getByRole('button', { name: /add workout day/i }).click()
  await page.getByText('Leg Day').click()

  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Name').fill('Squat')
  await page.getByRole('button', { name: /save exercise/i }).click()
  await expect(page.getByText('Squat')).toBeVisible()

  await page.getByRole('button', { name: /start workout/i }).click()
  await expect(page.getByText(/active workout/i)).toBeVisible()

  // Stop → Keep going leaves the workout active (accidental-tap guard).
  await page.getByRole('button', { name: /stop/i }).click()
  await page.getByRole('button', { name: /keep going/i }).click()
  await expect(page.getByText(/active workout/i)).toBeVisible()

  // Stop → Discard abandons it and sends the user home — a discarded workout
  // has nothing to summarize, so it must NOT show the "Workout complete" screen.
  await page.getByRole('button', { name: /stop/i }).click()
  await page.getByRole('button', { name: /discard workout/i }).click()
  await expect(page.getByRole('button', { name: /new workout day/i })).toBeVisible()
  await expect(page.getByText('Leg Day')).toBeVisible()
  await expect(page.getByText(/workout complete/i)).toHaveCount(0)
})
