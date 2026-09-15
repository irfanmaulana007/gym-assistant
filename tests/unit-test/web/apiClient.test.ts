import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  getRefreshToken,
  getToken,
  request,
  setRefreshToken,
  setToken,
  setUnauthorizedHandler,
} from '@/api/client'

// Unit tests for the typed API client: token injection, error-envelope parsing,
// 204 handling, and the central 401 handler.

function mockFetch(status: number, body?: unknown) {
  // 204/205/304 must have a null body per the Response spec.
  const hasBody = body !== undefined && status !== 204 && status !== 205 && status !== 304
  return vi.fn(async () =>
    new Response(hasBody ? JSON.stringify(body) : null, {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

describe('api client', () => {
  beforeEach(() => {
    localStorage.clear()
    setUnauthorizedHandler(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('injects the bearer token when present', async () => {
    setToken('abc123')
    const fetchMock = mockFetch(200, { ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await request('/api/v1/routines')

    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer abc123')
  })

  it('omits the token for anonymous requests', async () => {
    setToken('abc123')
    const fetchMock = mockFetch(200, { token: 't' })
    vi.stubGlobal('fetch', fetchMock)

    await request('/api/v1/auth/login', { method: 'POST', body: {}, anonymous: true })

    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined()
  })

  it('parses the standard error envelope into ApiError', async () => {
    vi.stubGlobal('fetch', mockFetch(422, { error: { code: 'validation_error', message: 'bad', details: { email: 'nope' } } }))

    await expect(request('/x', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 422,
      code: 'validation_error',
      message: 'bad',
    })
    try {
      await request('/x', { method: 'POST', body: {} })
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect((e as ApiError).details).toEqual({ email: 'nope' })
    }
  })

  it('returns undefined for 204 No Content', async () => {
    vi.stubGlobal('fetch', mockFetch(204))
    const result = await request('/api/v1/routines/x', { method: 'DELETE' })
    expect(result).toBeUndefined()
  })

  it('invokes the unauthorized handler on 401 with no refresh token', async () => {
    const onUnauth = vi.fn()
    setUnauthorizedHandler(onUnauth)
    vi.stubGlobal('fetch', mockFetch(401, { error: { code: 'unauthorized', message: 'nope' } }))

    await expect(request('/api/v1/auth/me')).rejects.toBeInstanceOf(ApiError)
    expect(onUnauth).toHaveBeenCalledOnce()
  })

  it('refreshes on 401 and transparently retries the original request', async () => {
    const onUnauth = vi.fn()
    setUnauthorizedHandler(onUnauth)
    setToken('expired')
    setRefreshToken('r0')

    // 1st call: protected request 401s. 2nd call: /auth/refresh succeeds.
    // 3rd call: the retried protected request succeeds with the new token.
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (String(url).includes('/auth/refresh')) {
        return new Response(JSON.stringify({ token: 'fresh', refresh_token: 'r1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const auth = (init.headers as Record<string, string>)['Authorization']
      if (auth === 'Bearer fresh') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'expired' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await request<{ ok: boolean }>('/api/v1/routines')

    expect(result).toEqual({ ok: true })
    expect(getToken()).toBe('fresh')
    expect(getRefreshToken()).toBe('r1')
    expect(onUnauth).not.toHaveBeenCalled()
    // Original (401) + refresh + retry = 3 fetches.
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('logs out when the refresh itself fails', async () => {
    const onUnauth = vi.fn()
    setUnauthorizedHandler(onUnauth)
    setToken('expired')
    setRefreshToken('r0')

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/auth/refresh')) {
        return new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'bad refresh' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'expired' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(request('/api/v1/routines')).rejects.toBeInstanceOf(ApiError)
    expect(onUnauth).toHaveBeenCalledOnce()
  })

  it('shares a single refresh across concurrent 401s', async () => {
    setToken('expired')
    setRefreshToken('r0')

    let refreshCalls = 0
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (String(url).includes('/auth/refresh')) {
        refreshCalls++
        return new Response(JSON.stringify({ token: 'fresh', refresh_token: 'r1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const auth = (init.headers as Record<string, string>)['Authorization']
      if (auth === 'Bearer fresh') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'expired' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await Promise.all([request('/api/v1/routines'), request('/api/v1/exercises'), request('/api/v1/sessions')])

    // Three concurrent expired requests must trigger exactly one refresh.
    expect(refreshCalls).toBe(1)
  })
})
