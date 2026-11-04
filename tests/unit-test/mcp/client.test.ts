import { describe, it, expect, vi } from 'vitest'
import { GymApiClient, GymApiError } from '@/client'
import { loadConfig } from '@/config'

const BASE = 'https://api.example.test'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function authHeader(init?: RequestInit): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.Authorization
}

describe('loadConfig', () => {
  it('defaults the base URL to production and strips trailing slashes', () => {
    const cfg = loadConfig({ GYM_API_TOKEN: 'abc' } as NodeJS.ProcessEnv)
    expect(cfg.baseUrl).toBe('https://api-gym.irfanmaulana007.com')
    expect(cfg.token).toBe('abc')
    expect(cfg.timeoutMs).toBe(15000)
  })

  it('throws when no credential is provided', () => {
    expect(() => loadConfig({} as NodeJS.ProcessEnv)).toThrow(/No credentials/)
  })

  it('accepts GYM_API_EMAIL as the identifier', () => {
    const cfg = loadConfig({
      GYM_API_EMAIL: 'me@example.com',
      GYM_API_PASSWORD: 'pw',
    } as NodeJS.ProcessEnv)
    expect(cfg.identifier).toBe('me@example.com')
  })

  it('rejects a non-https base URL for a non-local host', () => {
    expect(() =>
      loadConfig({ GYM_API_TOKEN: 'abc', GYM_API_BASE_URL: 'http://api.example.com' } as NodeJS.ProcessEnv),
    ).toThrow(/https/)
  })

  it('allows http for localhost', () => {
    const cfg = loadConfig({
      GYM_API_TOKEN: 'abc',
      GYM_API_BASE_URL: 'http://localhost:8080',
    } as NodeJS.ProcessEnv)
    expect(cfg.baseUrl).toBe('http://localhost:8080')
  })

  it('validates GYM_API_TIMEOUT_MS', () => {
    expect(() =>
      loadConfig({ GYM_API_TOKEN: 'a', GYM_API_TIMEOUT_MS: 'nope' } as NodeJS.ProcessEnv),
    ).toThrow(/GYM_API_TIMEOUT_MS/)
  })
})

describe('GymApiClient', () => {
  it('logs in with identifier/password, then sends the bearer token on GET', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ token: 'JWT1', refresh_token: 'R1' }))
      .mockResolvedValueOnce(jsonResponse({ routines: [{ id: 'r1', name: 'Push' }] }))

    const client = new GymApiClient(
      { baseUrl: BASE, identifier: 'me@example.com', password: 'pw', timeoutMs: 15000 },
      fetchMock,
    )

    const data = await client.get<{ routines: unknown[] }>('routines')
    expect(data.routines).toHaveLength(1)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/auth/login`)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/api/v1/routines`)
    expect(authHeader(fetchMock.mock.calls[1][1])).toBe('Bearer JWT1')
  })

  it('refreshes once for N concurrent 401s (never replays a single-use token)', async () => {
    let validToken = ''
    let refreshCount = 0
    let loginCount = 0

    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      const u = String(url)
      if (u.endsWith('/auth/login')) {
        loginCount++
        validToken = 'JWT1'
        return jsonResponse({ token: 'JWT1', refresh_token: 'R1' })
      }
      if (u.endsWith('/auth/refresh')) {
        refreshCount++
        validToken = 'JWT2'
        return jsonResponse({ token: 'JWT2', refresh_token: 'R2' })
      }
      return authHeader(init) === `Bearer ${validToken}`
        ? jsonResponse({ ok: true })
        : jsonResponse({ error: { code: 'unauthorized' } }, 401)
    })

    const client = new GymApiClient(
      { baseUrl: BASE, identifier: 'me@example.com', password: 'pw', timeoutMs: 15000 },
      fetchMock,
    )

    // Establish JWT1 via a login.
    await client.get('auth/me')
    expect(loginCount).toBe(1)

    // Access token expires: now JWT1 is rejected. Fire several concurrent calls.
    validToken = 'EXPIRED'
    const results = await Promise.all([client.get('a'), client.get('b'), client.get('c')])

    expect(results.every((r) => (r as { ok: boolean }).ok)).toBe(true)
    // Exactly one refresh for all three concurrent 401s — no replay.
    expect(refreshCount).toBe(1)
    expect(loginCount).toBe(1)
  })

  it('logs in only once for concurrent first-use calls', async () => {
    let loginCount = 0
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (String(url).endsWith('/auth/login')) {
        loginCount++
        return jsonResponse({ token: 'JWT1', refresh_token: 'R1' })
      }
      return jsonResponse({ ok: true })
    })

    const client = new GymApiClient(
      { baseUrl: BASE, identifier: 'me@example.com', password: 'pw', timeoutMs: 15000 },
      fetchMock,
    )

    await Promise.all([client.get('a'), client.get('b'), client.get('c')])
    expect(loginCount).toBe(1)
  })

  it('falls back to login when a refresh fails', async () => {
    let validToken = ''
    let loginCount = 0
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      const u = String(url)
      if (u.endsWith('/auth/login')) {
        loginCount++
        validToken = loginCount === 1 ? 'JWT1' : 'JWT2'
        return jsonResponse({ token: validToken, refresh_token: `R${loginCount}` })
      }
      if (u.endsWith('/auth/refresh')) {
        return jsonResponse({ error: { code: 'unauthorized' } }, 401) // reuse/expired
      }
      return authHeader(init) === `Bearer ${validToken}`
        ? jsonResponse({ ok: true })
        : jsonResponse({ error: { code: 'unauthorized' } }, 401)
    })

    const client = new GymApiClient(
      { baseUrl: BASE, identifier: 'me@example.com', password: 'pw', timeoutMs: 15000 },
      fetchMock,
    )

    await client.get('auth/me') // login #1 -> JWT1
    validToken = 'EXPIRED' // force a 401 -> refresh fails -> login #2
    const res = await client.get<{ ok: boolean }>('auth/me')
    expect(res.ok).toBe(true)
    expect(loginCount).toBe(2)
  })

  it('gives a static-token-only client a clear message when the token is rejected', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: { code: 'unauthorized' } }, 401))

    const client = new GymApiClient({ baseUrl: BASE, token: 'STALE', timeoutMs: 15000 }, fetchMock)

    const err = await client.get('auth/me').catch((e) => e)
    expect(err).toBeInstanceOf(GymApiError)
    expect(err.message).toMatch(/GYM_API_TOKEN/)
    // No login/refresh is possible, so no auth endpoints were called.
    expect(
      fetchMock.mock.calls.every(
        ([u]) => !String(u).endsWith('/auth/login') && !String(u).endsWith('/auth/refresh'),
      ),
    ).toBe(true)
  })

  it('builds query strings, dropping empty values', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ exercises: [] }))
    const client = new GymApiClient({ baseUrl: BASE, token: 'T', timeoutMs: 15000 }, fetchMock)
    await client.get('exercise-catalog', { search: 'bench', muscle_group: undefined, empty: '' })

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/api/v1/exercise-catalog')
    expect(url.searchParams.get('search')).toBe('bench')
    expect(url.searchParams.has('muscle_group')).toBe(false)
    expect(url.searchParams.has('empty')).toBe(false)
  })

  it('surfaces the API error envelope as a GymApiError', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ error: { code: 'not_found', message: 'routine not found' } }, 404),
      )
    const client = new GymApiClient({ baseUrl: BASE, token: 'T', timeoutMs: 15000 }, fetchMock)

    const err = await client.get('routines/x').catch((e) => e)
    expect(err).toBeInstanceOf(GymApiError)
    expect(err).toMatchObject({ status: 404, code: 'not_found', message: 'routine not found' })
  })

  it('maps a request timeout to a GymApiError', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      const e = new Error('timed out')
      e.name = 'TimeoutError'
      throw e
    })
    const client = new GymApiClient({ baseUrl: BASE, token: 'T', timeoutMs: 5 }, fetchMock)

    const err = await client.get('auth/me').catch((e) => e)
    expect(err).toBeInstanceOf(GymApiError)
    expect(err.code).toBe('timeout')
  })

  it('maps a network failure to a GymApiError', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed')
    })
    const client = new GymApiClient({ baseUrl: BASE, token: 'T', timeoutMs: 15000 }, fetchMock)

    const err = await client.get('auth/me').catch((e) => e)
    expect(err).toBeInstanceOf(GymApiError)
    expect(err.code).toBe('network_error')
  })
})
