import { describe, it, expect, vi, beforeEach } from 'vitest'

// Partial-mock the SDK so init is a spy (ESM namespace exports can't be
// re-spied with vi.spyOn across tests). Everything else stays real.
vi.mock('@sentry/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sentry/node')>()
  return { ...actual, init: vi.fn() }
})

import * as Sentry from '@sentry/node'
import { initSentry } from '@/sentry'

const initMock = vi.mocked(Sentry.init)

// The init helper must be a safe no-op without a DSN and configure Sentry with
// the expected options when one is supplied. Asserting the options init receives
// is stronger than a getClient() check and installs no real client.
describe('initSentry (mcp)', () => {
  beforeEach(() => {
    initMock.mockClear()
  })

  it('is a safe no-op when SENTRY_DSN is unset', () => {
    expect(initSentry({} as NodeJS.ProcessEnv)).toBe(false)
    expect(initMock).not.toHaveBeenCalled()
  })

  it('is a no-op for a blank/whitespace DSN', () => {
    expect(initSentry({ SENTRY_DSN: '   ' } as NodeJS.ProcessEnv)).toBe(false)
    expect(initMock).not.toHaveBeenCalled()
  })

  it('initializes Sentry with the DSN, environment and sampling', () => {
    const dsn = 'https://publickey@o0.ingest.sentry.io/0'
    expect(initSentry({ SENTRY_DSN: dsn, SENTRY_ENVIRONMENT: 'staging' } as NodeJS.ProcessEnv)).toBe(
      true,
    )
    expect(initMock).toHaveBeenCalledTimes(1)
    expect(initMock.mock.calls[0][0]).toMatchObject({
      dsn,
      environment: 'staging',
      tracesSampleRate: 0.2,
    })
  })
})
