import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Guards the port-isolation contract (.claude/rules/testing.md): the Playwright
// e2e config must run its OWN Vite + API servers on dedicated ports and never
// reuse or point at the local dev servers (:5173 web, :8080 API).
//
// The config is asserted as source text rather than imported: it resolves a
// filesystem path via `fileURLToPath(import.meta.url)`, which throws under the
// jsdom (non-file:// origin) environment these unit tests run in. Vitest runs
// with cwd = apps/web, where the config lives.
const configSource = readFileSync(
  resolve(process.cwd(), 'playwright.config.ts'),
  'utf8',
)

// Operative config with `//` line-comments stripped, so assertions target real
// config values rather than explanatory prose (which mentions the dev ports).
const configCode = configSource
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n')

describe('playwright e2e config — port isolation', () => {
  it('never wires the local dev ports (5173 / 8080) into config', () => {
    expect(configCode).not.toContain('5173')
    expect(configCode).not.toContain('8080')
  })

  it('never reuses an already-running dev server', () => {
    // Both webServer entries must opt out of reuse.
    const matches = configSource.match(/reuseExistingServer:\s*false/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('defaults the Vite server to the dedicated 4173 port', () => {
    expect(configSource).toMatch(/WEB_PORT\s*\?\?\s*4173/)
    expect(configSource).toContain('--port ${WEB_PORT}')
  })

  it('defaults the self-contained API stack to port 8090', () => {
    expect(configSource).toMatch(/E2E_API_PORT\s*\?\?\s*8090/)
    expect(configSource).toContain('./cmd/e2eserver')
  })

  it('points the browser at the test API, not the local one', () => {
    expect(configSource).toContain('VITE_API_BASE_URL: API_ORIGIN')
  })
})
