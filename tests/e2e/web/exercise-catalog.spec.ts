import { test, expect } from '@playwright/test'

// E2E (PRD 0006): the add-exercise flow leads with the shared catalog picker.
// register → create a routine → open it → "Add exercise" → pick "Barbell Bench
// Press" from the catalog → set targets → save → the exercise appears with its
// catalog-resolved muscle badge. Then add a custom exercise via the escape
// hatch and assert it saves with the chosen muscle group. The API+DB and Vite
// servers start automatically on dedicated test ports — never local :8080/:5173.

test('add a catalog exercise (targets only) and a custom exercise', async ({ page }) => {
  const email = `catalog_${Date.now()}@example.com`

  // Register.
  await page.goto('/register')
  await page.getByLabel('Display name').fill('Catalog User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  // Create and open a routine.
  await page.getByRole('button', { name: /new workout day/i }).click()
  await page.getByLabel('Workout day name').fill('Push Day')
  await page.getByRole('button', { name: /add workout day/i }).click()
  await page.getByText('Push Day').click()

  // Open the picker and search the catalog.
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Search').fill('Barbell Bench Press')

  // Pick the catalog entry -> advances to the targets step.
  await page.getByRole('button', { name: 'Add Barbell Bench Press', exact: true }).click()
  await expect(page.getByRole('button', { name: /back to catalog/i })).toBeVisible()

  // Save with the default targets (3 × 12). No name/muscle inputs to fill.
  await page.getByRole('button', { name: 'Add Barbell Bench Press', exact: true }).click()

  // The exercise appears named from the catalog, with its resolved chest badge
  // and the default 3×12 target.
  const benchRow = page.getByRole('link', { name: /Barbell Bench Press history/i })
  await expect(benchRow).toBeVisible()
  await expect(benchRow.getByText('Chest', { exact: true })).toBeVisible()
  await expect(benchRow.getByText('3×12')).toBeVisible()

  // Now add a custom exercise via the escape hatch.
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByRole('button', { name: /custom exercise/i }).click()
  await page.getByLabel('Name').fill('Cable Curl Variation')
  await page.getByLabel('Primary muscle group').selectOption('biceps')
  await page.getByRole('button', { name: /save exercise/i }).click()

  const curlRow = page.getByRole('link', { name: /Cable Curl Variation history/i })
  await expect(curlRow).toBeVisible()
  await expect(curlRow.getByText('Biceps', { exact: true })).toBeVisible()
})
