import { test, expect } from '@playwright/test'

// Functional guard for the bottom-sheet ENTER animation: on open the panel must
// slide UP from below the viewport and settle on-screen — not appear with no
// transition. (The precise single-vs-double-rAF timing that caused the reported
// pop-in is guarded deterministically in the Sheet unit test; a real browser
// can't reliably distinguish the two, so here we assert the slide runs at all.)
//
// We slow the transition to 2s, then sample the panel's transform right after
// opening: it must still be translated DOWN (a positive translateY), proving it
// is mid-slide-up from the bottom, then settle on-screen (identity transform).
// Removing the transition or never applying `is-open` would fail this.
//
// Servers start on dedicated test ports (see the config) — never local :8080/:5173.

const parseTranslateY = (transform: string): number => {
  if (!transform || transform === 'none') return 0
  // getComputedStyle returns a matrix: matrix(a, b, c, d, tx, ty).
  const m = transform.match(/matrix\(([^)]+)\)/)
  if (!m) return 0
  const parts = m[1].split(',').map((n) => parseFloat(n.trim()))
  return parts[5] ?? 0
}

test('bottom sheet slides up on open (enter animation runs)', async ({ page }) => {
  const email = `sheet_${Date.now()}@example.com`

  await page.goto('/register')
  await page.getByLabel('Display name').fill('Sheet User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: /create account/i }).click()

  // Slow the sheet transition so we can reliably observe the mid-flight state.
  await page.addStyleTag({
    content: '.sheet { transition-duration: 2s !important; }',
  })

  await page.getByRole('button', { name: /new workout day/i }).click()

  const panel = page.getByRole('dialog', { name: /new workout day/i })
  await expect(panel).toBeVisible()

  // Caught mid-slide: the panel starts off-screen (translateY(100%)) and is
  // still translated DOWN a moment after opening — it is animating up, not
  // already parked in place. A regression (popping in) would read ~0 here.
  const midTransform = await panel.evaluate((el) => getComputedStyle(el).transform)
  expect(parseTranslateY(midTransform)).toBeGreaterThan(20)

  // It ends on-screen: transform settles to identity (translateY(0)).
  await expect
    .poll(async () => parseTranslateY(await panel.evaluate((el) => getComputedStyle(el).transform)))
    .toBeLessThanOrEqual(1)
})
