import { describe, it, expect, vi, beforeEach } from 'vitest'

// Partial-mock the SDK so init is a spy (ESM namespace exports can't be
// re-spied with vi.spyOn across tests); browserTracingIntegration etc. stay real.
vi.mock('@sentry/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sentry/react')>()
  return { ...actual, init: vi.fn() }
})

import * as Sentry from '@sentry/react'
import { initSentry } from '@/sentry'

const initMock = vi.mocked(Sentry.init)

// The web init helper must be a safe no-op without a DSN and configure Sentry
// with the expected options when one is supplied. Asserting the options is
// stronger than a getClient() check and installs no real client.
describe('initSentry (web)', () => {
  beforeEach(() => {
    initMock.mockClear()
  })

  it('is a safe no-op when VITE_SENTRY_DSN is unset', () => {
    expect(initSentry({} as ImportMetaEnv)).toBe(false)
    expect(initMock).not.toHaveBeenCalled()
  })

  it('is a no-op for a blank/whitespace DSN', () => {
    expect(initSentry({ VITE_SENTRY_DSN: '   ' } as ImportMetaEnv)).toBe(false)
    expect(initMock).not.toHaveBeenCalled()
  })

  it('initializes Sentry with the DSN, environment and sampling', () => {
    const dsn = 'https://publickey@o0.ingest.sentry.io/0'
    expect(
      initSentry({ VITE_SENTRY_DSN: dsn, VITE_SENTRY_ENVIRONMENT: 'staging' } as ImportMetaEnv),
    ).toBe(true)
    expect(initMock).toHaveBeenCalledTimes(1)
    expect(initMock.mock.calls[0][0]).toMatchObject({
      dsn,
      environment: 'staging',
      tracesSampleRate: 0.2,
    })
  })
})
