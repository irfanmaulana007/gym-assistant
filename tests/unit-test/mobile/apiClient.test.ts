import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  getToken,
  request,
  setTokenStore,
  setUnauthorizedHandler,
  type TokenStore,
} from '@/api/client'

// Build a fake Response the client understands (ok/status/text/json).
function resp(status: number, body: unknown) {
  const text = body === undefined ? '' : JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => body,
  } as unknown as Response
}

function memStore(token: string | null, refresh: string | null): TokenStore {
  let t = token
  let r = refresh
  return {
    getToken: () => t,
    setToken: (v) => {
      t = v
    },
    getRefreshToken: () => r,
    setRefreshToken: (v) => {
      r = v
    },
  }
}

describe('api client — transparent 401 → refresh → replay (PRD 0018 §4.4)', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    setTokenStore(memStore('old', 'r'))
    setUnauthorizedHandler(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('dedupes concurrent 401s into a single refresh, replays both, and stores the new tokens', async () => {
    let refreshCalls = 0
    fetchMock.mockImplementation((url: string, opts: { headers: Record<string, string> }) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++
        return Promise.resolve(resp(200, { token: 'new', refresh_token: 'r2' }))
      }
      const auth = opts.headers['Authorization']
      return Promise.resolve(
        auth === 'Bearer new' ? resp(200, { ok: true }) : resp(401, { error: { code: 'unauthorized', message: 'expired' } }),
      )
    })

    const [a, b] = await Promise.all([
      request<{ ok: boolean }>('/api/v1/routines'),
      request<{ ok: boolean }>('/api/v1/sessions'),
    ])

    expect(refreshCalls).toBe(1) // single-flight: one refresh for the burst of 401s
    expect(a).toEqual({ ok: true })
    expect(b).toEqual({ ok: true })
    expect(getToken()).toBe('new')
  })

  it('logs out once when the refresh itself fails', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/auth/refresh')
          ? resp(401, undefined)
          : resp(401, { error: { code: 'unauthorized', message: 'expired' } }),
      ),
    )

    await expect(request('/api/v1/routines')).rejects.toBeInstanceOf(ApiError)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('does not attach a bearer token to anonymous requests', async () => {
    fetchMock.mockResolvedValue(resp(200, { token: 't', refresh_token: 'r', user: {} }))
    await request('/api/v1/auth/login', { method: 'POST', anonymous: true, body: { identifier: 'a', password: 'b' } })
    const [, opts] = fetchMock.mock.calls[0]
    expect(opts.headers['Authorization']).toBeUndefined()
  })
})
