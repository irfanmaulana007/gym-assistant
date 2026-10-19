import { test, expect } from '@playwright/test'

// E2E (PRD 0021): the workout-day detail page shows an aggregated "Muscles
// worked" row — the distinct muscle groups the day will hit — BEFORE the session
// is started, so the user can see what a workout day trains. The API+DB and Vite
// servers start automatically on dedicated test ports (see playwright.config.ts)
// — never the local :8080/:5173.

test('workout-day detail previews the muscle groups it will hit before starting', async ({ page }) => {
  const email = `muscles_${Date.now()}@example.com`

  // Register.
  await page.goto('/register')
  await page.getByLabel('Display name').fill('Muscles User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  // Create and open a workout day.
  await page.getByRole('link', { name: 'Workout' }).click()
  await page.getByRole('button', { name: /new workout day/i }).click()
  await page.getByLabel('Workout day name').fill('Push Day')
  await page.getByRole('button', { name: /add workout day/i }).click()
  await page.getByText('Push Day').click()

  // Add a chest exercise (the custom form defaults the primary group to chest).
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByRole('button', { name: /custom exercise/i }).click()
  await page.getByLabel('Name').fill('Bench Press')
  await page.getByLabel('Primary muscle group').selectOption('chest')
  await page.getByRole('button', { name: /save exercise/i }).click()
  await expect(page.getByText('Bench Press')).toBeVisible()

  // Add a shoulders exercise, so the day hits more than one group.
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByRole('button', { name: /custom exercise/i }).click()
  await page.getByLabel('Name').fill('Overhead Press')
  await page.getByLabel('Primary muscle group').selectOption('shoulders')
  await page.getByRole('button', { name: /save exercise/i }).click()
  await expect(page.getByText('Overhead Press')).toBeVisible()

  // The aggregated "Muscles worked" card is visible WITHOUT starting a session.
  // Scope badge assertions to that card so they don't match the per-exercise
  // primary badges in the list below.
  const musclesCard = page.locator('.card', { hasText: 'Muscles worked' })
  await expect(musclesCard).toBeVisible()
  await expect(musclesCard.getByText('Chest')).toBeVisible()
  await expect(musclesCard.getByText('Shoulders')).toBeVisible()

  // The day has not been started — the "Start workout" CTA is still present.
  await expect(page.getByRole('button', { name: /start workout/i })).toBeVisible()
})
