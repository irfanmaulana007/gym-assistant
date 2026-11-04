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

describe('loadConfig', () => {
  it('defaults the base URL to production and strips trailing slashes', () => {
    const cfg = loadConfig({ GYM_API_TOKEN: 'abc' } as NodeJS.ProcessEnv)
    expect(cfg.baseUrl).toBe('https://api-gym.irfanmaulana007.com')
    expect(cfg.token).toBe('abc')
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
})

describe('GymApiClient', () => {
  it('logs in with identifier/password, then sends the bearer token on GET', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ token: 'JWT1', refresh_token: 'R1' }))
      .mockResolvedValueOnce(jsonResponse({ routines: [{ id: 'r1', name: 'Push' }] }))

    const client = new GymApiClient(
      { baseUrl: BASE, identifier: 'me@example.com', password: 'pw' },
      fetchMock,
    )

    const data = await client.get<{ routines: unknown[] }>('routines')
    expect(data.routines).toHaveLength(1)

    // First call: login (POST). Second: the GET with the bearer token.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [loginUrl, loginInit] = fetchMock.mock.calls[0]
    expect(loginUrl).toBe(`${BASE}/api/v1/auth/login`)
    expect(loginInit?.method).toBe('POST')

    const [getUrl, getInit] = fetchMock.mock.calls[1]
    expect(getUrl).toBe(`${BASE}/api/v1/routines`)
    expect(getInit?.method).toBe('GET')
    expect((getInit?.headers as Record<string, string>).Authorization).toBe('Bearer JWT1')
  })

  it('refreshes and retries once on a 401', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      // initial GET with the stale static token -> 401
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'unauthorized' } }, 401))
      // refresh exchange
      .mockResolvedValueOnce(jsonResponse({ token: 'JWT2', refresh_token: 'R2' }))
      // retried GET succeeds
      .mockResolvedValueOnce(jsonResponse({ ok: true }))

    const client = new GymApiClient(
      { baseUrl: BASE, token: 'STALE', refreshToken: 'R1' },
      fetchMock,
    )

    const data = await client.get<{ ok: boolean }>('auth/me')
    expect(data.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    const retryInit = fetchMock.mock.calls[2][1]
    expect((retryInit?.headers as Record<string, string>).Authorization).toBe('Bearer JWT2')
  })

  it('builds query strings, dropping empty values', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ exercises: [] }))

    const client = new GymApiClient({ baseUrl: BASE, token: 'T' }, fetchMock)
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

    const client = new GymApiClient({ baseUrl: BASE, token: 'T' }, fetchMock)

    const err = await client.get('routines/nope').catch((e) => e)
    expect(err).toBeInstanceOf(GymApiError)
    expect(err).toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'routine not found',
    })
  })
})
