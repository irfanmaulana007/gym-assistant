import { test, expect } from '@playwright/test'

// E2E: PRD 0008 profile enrichment in a real browser (mobile viewport). Servers
// start on dedicated test ports (playwright.config.ts) — never local :8080/:5173.
//
// Run: (from apps/web) `npm run test:e2e`.

// A minimal 1×1 PNG for the avatar file input.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function register(page: import('@playwright/test').Page, opts: { username?: string; password?: string }) {
  const unique = Date.now() + Math.floor(performance.now())
  const email = `e2e_prof_${unique}@example.com`
  const username = opts.username ? `${opts.username}${unique}` : undefined
  await page.goto('/register')
  await page.getByLabel('Display name').fill('E2E Prof')
  if (username) await page.getByLabel(/username/i).fill(username)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(opts.password ?? 'supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()
  await expect(page).toHaveURL(/\/$/)
  return { email, username }
}

test('register with username, log in by username, edit profile, avatar on nav', async ({ page }) => {
  const { username } = await register(page, { username: 'lifter' })

  // Log out, then log back in using the USERNAME (not email).
  await page.getByRole('link', { name: 'Profile' }).click()
  await page.getByRole('button', { name: /logout/i }).click()
  await expect(page.getByRole('button', { name: /^log in$/i })).toBeVisible()

  await page.getByLabel('Username or email').fill(username!)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /^log in$/i }).click()
  await expect(page).toHaveURL(/\/$/)

  // Edit the profile: gender, body weight (in lb), goal, preferred unit = lb,
  // and an avatar.
  await page.getByRole('link', { name: 'Profile' }).click()
  await page.getByRole('link', { name: /edit profile/i }).click()
  await expect(page.getByRole('heading', { name: 'Edit profile' })).toBeVisible()

  await page.getByLabel('Gender').selectOption('female')
  await page.getByLabel('Body weight', { exact: true }).fill('80')
  await page.getByRole('tablist', { name: 'Body weight unit' }).getByRole('tab', { name: 'lb' }).click()
  await page.getByLabel('Goal').selectOption('build_muscle')
  await page.getByRole('tablist', { name: 'Preferred weight unit' }).getByRole('tab', { name: 'lb' }).click()
  await page.getByLabel('Profile photo', { exact: true }).setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: PNG_1PX })

  await page.getByRole('button', { name: /save profile/i }).click()

  // Back on the Profile screen the edited values render in the preferred unit.
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByText('Female')).toBeVisible()
  await expect(page.getByText('80lb')).toBeVisible()
  await expect(page.getByText('Build muscle')).toBeVisible()

  // The avatar now shows on the bottom-nav Profile tab.
  await expect(page.locator('img.bottom-nav-avatar')).toBeVisible()
})

test('change password, then log in with the new password', async ({ page }) => {
  const { email } = await register(page, { password: 'originalpass1' })

  await page.getByRole('link', { name: 'Profile' }).click()
  await page.getByRole('link', { name: /change password/i }).click()
  await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible()

  await page.getByLabel('Current password').fill('originalpass1')
  await page.getByLabel('New password', { exact: true }).fill('brandnewpass2')
  await page.getByLabel('Confirm new password').fill('brandnewpass2')
  await page.getByRole('button', { name: /update password/i }).click()

  // Pops back to the profile on success.
  await expect(page).toHaveURL(/\/profile$/)

  // Log out and back in with the NEW password.
  await page.getByRole('button', { name: /logout/i }).click()
  await expect(page.getByRole('button', { name: /^log in$/i })).toBeVisible()
  await page.getByLabel('Username or email').fill(email)
  await page.getByLabel('Password').fill('brandnewpass2')
  await page.getByRole('button', { name: /^log in$/i }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()
})
