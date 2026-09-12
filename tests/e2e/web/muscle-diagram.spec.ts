import { test, expect, type Page } from '@playwright/test'

// E2E: PRD 0009 — the Info tab's "Muscles worked" card renders anatome's muscle
// diagram above the text badges, derived purely from the exercise's stored
// muscle groups. No external network: the anatome request is intercepted and we
// assert the URL we build (not anatome's rendering). Requires the API + Vite dev
// server from playwright.config.ts.

// A tiny valid 1x1 PNG so the <img> onLoad fires without touching the network.
// (A raw SVG string is not reliably decoded as an <img> across engines; a real
// bitmap always is — and we assert the URL we build, not anatome's rendering.)
const FAKE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

async function register(page: Page, tag: string) {
  const email = `${tag}_${Date.now()}@example.com`
  await page.goto('/register')
  await page.getByLabel('Display name').fill('Diagram User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()
}

// Create a routine + custom exercise, then open the exercise detail page.
// The day name is kept distinct from the exercise name so locators don't
// ambiguously match the day heading.
async function createExercise(page: Page, name: string, muscleLabel?: string) {
  await page.getByRole('link', { name: 'Workout' }).click()
  await page.getByRole('button', { name: /new workout day/i }).click()
  await page.getByLabel('Workout day name').fill('Session A')
  await page.getByRole('button', { name: /add workout day/i }).click()
  await page.getByText('Session A').click()

  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByRole('button', { name: /custom exercise/i }).click()
  await page.getByLabel('Name').fill(name)
  if (muscleLabel) {
    await page.getByLabel('Primary muscle group').selectOption({ label: muscleLabel })
  }
  await page.getByRole('button', { name: /save exercise/i }).click()

  // Open the exercise detail page via its list link, then confirm we're there.
  await page.getByRole('link', { name: new RegExp(`${name} history`, 'i') }).click()
  await expect(page.getByRole('tab', { name: 'Info' })).toBeVisible()
}

test('shows the muscle diagram for a mappable exercise', async ({ page }) => {
  let requestedUrl = ''
  await page.route('**/generateImage**', async (route) => {
    requestedUrl = route.request().url()
    await route.fulfill({ contentType: 'image/png', body: FAKE_IMAGE })
  })

  await register(page, 'diagram_ok')
  // Default custom exercise primary muscle group is Chest.
  await createExercise(page, 'Bench Press')

  // Info tab is default — the diagram <img> renders and loads.
  const img = page.getByRole('img', { name: /muscles worked/i })
  await expect(img).toBeVisible()

  // The built URL targets anatome's generateImage with DC2626:chest in the layers.
  expect(requestedUrl).toContain('/generateImage')
  const layers = new URL(requestedUrl).searchParams.get('layers')
  expect(layers).toContain('DC2626:chest')

  // The legend is present alongside the always-visible badge.
  await expect(page.locator('.muscle-diagram-legend')).toContainText('Primary')
})

test('falls back to badges only for a cardio exercise (no diagram)', async ({ page }) => {
  await page.route('**/generateImage**', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: FAKE_IMAGE })
  })

  await register(page, 'diagram_cardio')
  await createExercise(page, 'Treadmill', 'Cardio')

  // No diagram image, but the text badge remains.
  await expect(page.getByRole('img', { name: /muscles worked/i })).toHaveCount(0)
  await expect(page.getByText('Cardio')).toBeVisible()
})

test('falls back to badges only when the diagram fails to load', async ({ page }) => {
  await page.route('**/generateImage**', (route) => route.abort())

  await register(page, 'diagram_fail')
  await createExercise(page, 'Incline Press')

  // The card gracefully shows the badge; the broken image is removed on error.
  await expect(page.getByText('Chest')).toBeVisible()
  await expect(page.getByRole('img', { name: /muscles worked/i })).toHaveCount(0)
})
