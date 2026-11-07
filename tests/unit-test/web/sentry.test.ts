import { describe, it, expect } from 'vitest'
import * as Sentry from '@sentry/react'
import { initSentry } from '@/sentry'

// The web Sentry init helper must be a safe no-op without a DSN and configure
// Sentry when one is supplied. Sentry.init only builds the client — nothing is
// sent unless an error is captured.
describe('initSentry (web)', () => {
  it('is a safe no-op when VITE_SENTRY_DSN is unset', () => {
    expect(initSentry({} as ImportMetaEnv)).toBe(false)
  })

  it('is a no-op for a blank/whitespace DSN', () => {
    expect(initSentry({ VITE_SENTRY_DSN: '   ' } as ImportMetaEnv)).toBe(false)
  })

  it('initializes Sentry when VITE_SENTRY_DSN is set', () => {
    const dsn = 'https://publickey@o0.ingest.sentry.io/0'
    expect(initSentry({ VITE_SENTRY_DSN: dsn, MODE: 'test' } as ImportMetaEnv)).toBe(true)
    expect(Sentry.getClient()).toBeDefined()
  })
})
