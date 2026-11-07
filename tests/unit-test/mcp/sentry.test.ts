import { describe, it, expect } from 'vitest'
import * as Sentry from '@sentry/node'
import { initSentry } from '@/sentry'

// The init helper must be a safe no-op without a DSN and configure Sentry when
// one is supplied. sentry.init only builds the client/transport — nothing is
// sent over the network unless an event is captured and flushed.
describe('initSentry', () => {
  it('is a safe no-op when SENTRY_DSN is unset', () => {
    expect(initSentry({} as NodeJS.ProcessEnv)).toBe(false)
  })

  it('is a no-op for a blank/whitespace DSN', () => {
    expect(initSentry({ SENTRY_DSN: '   ' } as NodeJS.ProcessEnv)).toBe(false)
  })

  it('initializes Sentry when SENTRY_DSN is set', () => {
    const dsn = 'https://publickey@o0.ingest.sentry.io/0'
    expect(initSentry({ SENTRY_DSN: dsn, NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(true)
    expect(Sentry.getClient()).toBeDefined()
  })
})
