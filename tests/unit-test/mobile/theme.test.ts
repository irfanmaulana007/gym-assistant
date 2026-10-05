import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { color, layout, radius, sp } from '@/theme/tokens'

// The native theme is a verbatim port of the web :root tokens. This asserts the
// two never drift (PRD 0018 §4.3) by reading the real styles.css and comparing
// the key tokens against theme/tokens.ts.
const cssPath = fileURLToPath(new URL('../../../apps/web/src/styles.css', import.meta.url))
const css = readFileSync(cssPath, 'utf8')

function cssVar(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`))
  if (!m) throw new Error(`missing --${name} in styles.css`)
  return m[1].trim()
}

describe('theme parity with web styles.css', () => {
  it('matches the semantic color tokens', () => {
    expect(color.bg).toBe(cssVar('bg'))
    expect(color.surface).toBe(cssVar('surface'))
    expect(color.text).toBe(cssVar('text'))
    expect(color.textMuted).toBe(cssVar('text-muted'))
    expect(color.primary).toBe(cssVar('primary'))
    expect(color.primaryInk).toBe(cssVar('primary-ink'))
    expect(color.danger).toBe(cssVar('danger'))
    expect(color.accent).toBe(cssVar('accent'))
  })

  it('matches the muscle / usage scale hexes (PRD 0009 / 0011 single-source)', () => {
    expect(color.musclePrimary).toBe(cssVar('muscle-primary'))
    expect(color.muscleSecondary).toBe(cssVar('muscle-secondary'))
    expect(color.muscleUsage1).toBe(cssVar('muscle-usage-1'))
    expect(color.muscleUsage4).toBe(cssVar('muscle-usage-4'))
  })

  it('matches the spacing, radius, and layout scales', () => {
    expect(`${sp[4]}px`).toBe(cssVar('sp-4'))
    expect(`${sp[8]}px`).toBe(cssVar('sp-8'))
    expect(`${radius.base}px`).toBe(cssVar('radius'))
    expect(`${radius.lg}px`).toBe(cssVar('radius-lg'))
    expect(`${layout.maxWidth}px`).toBe(cssVar('max-width'))
    expect(`${layout.bottomNavH}px`).toBe(cssVar('bottom-nav-h'))
  })
})
