import { test, expect } from '@playwright/test'

// E2E: the "Primary muscle group" select on the add-exercise form groups its
// options under body-area <optgroup> sections (Chest, Back, …, Legs, Other) so a
// group is easier to find, and shows each option with a capitalized label rather
// than raw snake_case. Requires the API running at VITE_API_BASE_URL and the
// Vite dev server (started by the config).

test('primary muscle group select is grouped by body area', async ({ page }) => {
  const email = `muscle_${Date.now()}@example.com`

  // Register.
  await page.goto('/register')
  await page.getByLabel('Display name').fill('Muscle User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  // Create and open a routine.
  await page.getByRole('button', { name: /new workout day/i }).click()
  await page.getByLabel('Workout day name').fill('Push Day')
  await page.getByRole('button', { name: /add workout day/i }).click()
  await page.getByText('Push Day').click()

  // Open the add-exercise sheet, where the muscle-group select lives.
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()

  const select = page.getByLabel('Primary muscle group')
  await expect(select).toBeVisible()

  // Body-area optgroups are present.
  for (const label of ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Other']) {
    await expect(select.locator(`optgroup[label="${label}"]`)).toHaveCount(1)
  }

  // Arm movements live under the "Arms" optgroup, shown as capitalized labels
  // (not raw snake_case), while their underlying values stay lowercase.
  await expect(
    select.locator('optgroup[label="Arms"] > option'),
  ).toHaveText(['Biceps', 'Triceps', 'Forearms'])

  // A multi-word value renders with its underscore dropped and capitalized.
  await expect(
    select.locator('optgroup[label="Other"] > option[value="full_body"]'),
  ).toHaveText('Full body')

  // Selecting a grouped value works end to end.
  await select.selectOption('hamstrings')
  await expect(select).toHaveValue('hamstrings')
})
