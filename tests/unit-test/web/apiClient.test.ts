import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request, setToken, setUnauthorizedHandler } from '@/api/client'

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

  it('invokes the unauthorized handler on 401', async () => {
    const onUnauth = vi.fn()
    setUnauthorizedHandler(onUnauth)
    vi.stubGlobal('fetch', mockFetch(401, { error: { code: 'unauthorized', message: 'nope' } }))

    await expect(request('/api/v1/auth/me')).rejects.toBeInstanceOf(ApiError)
    expect(onUnauth).toHaveBeenCalledOnce()
  })
})
