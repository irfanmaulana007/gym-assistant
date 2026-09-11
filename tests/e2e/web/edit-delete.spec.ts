import { test, expect } from '@playwright/test'

// E2E (PRD 0003): edit and delete live on the detail pages, not the list rows.
// register → create a routine → edit its name on the detail page → add an
// exercise → edit the exercise → delete the exercise → delete the routine.
// Requires the API running at VITE_API_BASE_URL and the Vite dev server.

test('edit and delete a routine and exercise from their detail pages', async ({ page }) => {
  const email = `editdel_${Date.now()}@example.com`

  // Register.
  await page.goto('/register')
  await page.getByLabel('Display name').fill('Edit User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  // Create a routine and open its detail page.
  await page.getByRole('button', { name: /new workout day/i }).click()
  await page.getByLabel('Workout day name').fill('Push Day')
  await page.getByRole('button', { name: /add workout day/i }).click()
  await page.getByText('Push Day').click()

  // The list row has no inline delete control.
  await expect(page.getByRole('button', { name: /delete push day/i })).toHaveCount(0)

  // Edit the routine name from the detail page.
  await page.getByRole('button', { name: /edit workout day/i }).click()
  await page.getByLabel('Workout day name').fill('Chest Day')
  await page.getByRole('button', { name: /save changes/i }).click()
  await expect(page.getByRole('heading', { name: 'Chest Day' })).toBeVisible()

  // Add an exercise (via the "Custom exercise" free-text form; PRD 0006 leads
  // with the catalog picker).
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByRole('button', { name: /custom exercise/i }).click()
  await page.getByLabel('Name').fill('Bench Press')
  await page.getByRole('button', { name: /save exercise/i }).click()
  await expect(page.getByText('Bench Press')).toBeVisible()

  // Open the exercise detail and edit its target reps.
  await page.getByText('Bench Press').click()
  await page.getByRole('button', { name: /edit exercise/i }).click()
  await expect(page.getByLabel('Name')).toHaveValue('Bench Press')
  await page.getByLabel('Reps').fill('10')
  await page.getByRole('button', { name: /save changes/i }).click()

  // Back on the routine, the exercise row reflects the new target.
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByText('4×10')).toBeVisible()

  // Delete the exercise from its detail page → back on the routine.
  await page.getByText('Bench Press').click()
  await page.getByRole('button', { name: /edit exercise/i }).click()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: /delete exercise/i }).click()
  await expect(page.getByRole('heading', { name: 'Chest Day' })).toBeVisible()
  await expect(page.getByText('Bench Press')).toHaveCount(0)

  // Delete the routine from its detail page → back on the list.
  await page.getByRole('button', { name: /edit workout day/i }).click()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: /delete workout day/i }).click()
  await expect(page.getByRole('heading', { name: 'Workouts' })).toBeVisible()
  await expect(page.getByText('Chest Day')).toHaveCount(0)
})
