import { test, expect } from '@playwright/test'

// E2E: a distance exercise can be created with a distance target + unit (not
// sets/reps) and the target round-trips. register → create a routine → open it
// → "Add exercise" → Custom exercise → choose the "Distance" type → the form
// swaps sets/reps for a distance value + km/mi/m unit → save → the row shows the
// distance target (e.g. "5km"), and it survives a reload (persisted read-back).
// The API+DB and Vite servers start automatically on dedicated test ports.

test('create a distance exercise with a distance target that round-trips', async ({ page }) => {
  const email = `distance_${Date.now()}@example.com`

  // Register.
  await page.goto('/register')
  await page.getByLabel('Display name').fill('Distance User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  // Create and open a routine.
  await page.getByRole('link', { name: 'Workout' }).click()
  await page.getByRole('button', { name: /new workout day/i }).click()
  await page.getByLabel('Workout day name').fill('Cardio Day')
  await page.getByRole('button', { name: /add workout day/i }).click()
  await page.getByText('Cardio Day').click()

  // Add a custom exercise and switch its type to Distance.
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByRole('button', { name: /custom exercise/i }).click()
  await page.getByLabel('Name').fill('Treadmill Run')
  await page.getByLabel('Type').selectOption('distance')

  // The distance branch replaces sets/reps with a distance value + unit.
  await expect(page.getByLabel('Sets')).toHaveCount(0)
  await expect(page.getByLabel('Reps')).toHaveCount(0)
  const distance = page.getByLabel('Target distance')
  await distance.fill('5')
  await page.getByLabel('Unit').selectOption('km')
  await page.getByLabel('Primary muscle group').selectOption('quads')

  await page.getByRole('button', { name: /save exercise/i }).click()

  // The exercise appears with its distance target (not a sets×reps value).
  const runRow = page.getByRole('link', { name: /Treadmill Run history/i })
  await expect(runRow).toBeVisible()
  await expect(runRow.getByText('5km')).toBeVisible()
  await expect(runRow.getByText('Quads', { exact: true })).toBeVisible()

  // Round-trip: the distance target persists across a reload (server read-back).
  await page.reload()
  const runRowAfter = page.getByRole('link', { name: /Treadmill Run history/i })
  await expect(runRowAfter).toBeVisible()
  await expect(runRowAfter.getByText('5km')).toBeVisible()
})
