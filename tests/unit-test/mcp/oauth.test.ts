import { describe, it, expect, vi } from 'vitest'
import { Sealer } from '@/oauth/seal'
import { ApiAuth, jwtExpiry } from '@/oauth/apiAuth'
import { GymOAuthProvider, LOGIN_STATE_TTL_SECONDS } from '@/oauth/provider'
import { escapeHtml, renderLoginPage } from '@/oauth/loginPage'
import { loadHttpConfig } from '@/config'
import { GymApiError } from '@/client'
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js'

const SECRET = 'x'.repeat(40)
const RESOURCE = new URL('https://mcp.example.test/mcp')

function fakeJwt(exp: number): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp })}.sig`
}

describe('Sealer', () => {
  it('round-trips a payload for the same purpose', () => {
    const s = new Sealer(SECRET)
    const sealed = s.seal('access', { a: 1 }, 60)
    expect(s.open<{ a: number }>('access', sealed)?.data).toEqual({ a: 1 })
  })

  it('rejects a different purpose, a tampered value, and another secret', () => {
    const s = new Sealer(SECRET)
    const sealed = s.seal('refresh', { a: 1 }, 60)
    expect(s.open('access', sealed)).toBeUndefined()
    const flipped = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'BB' : 'AA')
    expect(s.open('refresh', flipped)).toBeUndefined()
    expect(new Sealer('y'.repeat(40)).open('refresh', sealed)).toBeUndefined()
    expect(s.open('refresh', 'garbage')).toBeUndefined()
  })

  it('rejects an expired value', () => {
    let now = 1_000
    const s = new Sealer(SECRET, () => now)
    const sealed = s.seal('code', { a: 1 }, 10)
    now = 1_009
    expect(s.open('code', sealed)).toBeDefined()
    now = 1_010
    expect(s.open('code', sealed)).toBeUndefined()
  })
})

describe('loadHttpConfig', () => {
  const base = { MCP_PUBLIC_URL: 'https://mcp.example.test', MCP_OAUTH_SECRET: SECRET }

  it('loads defaults', () => {
    const cfg = loadHttpConfig(base as NodeJS.ProcessEnv)
    expect(cfg).toMatchObject({
      publicUrl: 'https://mcp.example.test',
      baseUrl: 'https://api-gym.irfanmaulana007.com',
      port: 3000,
      trustProxy: 0,
    })
  })

  it('requires a public URL, https, no path, and a long secret', () => {
    expect(() => loadHttpConfig({ MCP_OAUTH_SECRET: SECRET } as NodeJS.ProcessEnv)).toThrow(/MCP_PUBLIC_URL/)
    expect(() =>
      loadHttpConfig({ ...base, MCP_PUBLIC_URL: 'http://mcp.example.test' } as NodeJS.ProcessEnv),
    ).toThrow(/https/)
    expect(() =>
      loadHttpConfig({ ...base, MCP_PUBLIC_URL: 'https://mcp.example.test/sub' } as NodeJS.ProcessEnv),
    ).toThrow(/without a path/)
    expect(() => loadHttpConfig({ ...base, MCP_OAUTH_SECRET: 'short' } as NodeJS.ProcessEnv)).toThrow(
      /MCP_OAUTH_SECRET/,
    )
  })

  it('rejects the long-but-placeholder change-me secret (F4)', () => {
    expect(() =>
      loadHttpConfig({ ...base, MCP_OAUTH_SECRET: 'change-me-to-a-long-random-secret' } as NodeJS.ProcessEnv),
    ).toThrow(/placeholder/)
  })

  it('parses an optional DCR redirect-uri allowlist (F2)', () => {
    const cfg = loadHttpConfig({
      ...base,
      MCP_ALLOWED_REDIRECT_URIS: 'https://a.test/cb, https://b.test/cb',
    } as NodeJS.ProcessEnv)
    expect(cfg.allowedRedirectUris).toEqual(['https://a.test/cb', 'https://b.test/cb'])
    expect(loadHttpConfig(base as NodeJS.ProcessEnv).allowedRedirectUris).toEqual([])
  })

  it('allows plain http on loopback for local dev', () => {
    const cfg = loadHttpConfig({ ...base, MCP_PUBLIC_URL: 'http://127.0.0.1:4000' } as NodeJS.ProcessEnv)
    expect(cfg.publicUrl).toBe('http://127.0.0.1:4000')
  })
})

describe('jwtExpiry / escapeHtml', () => {
  it('reads exp from a JWT payload and tolerates garbage', () => {
    expect(jwtExpiry(fakeJwt(1234))).toBe(1234)
    expect(jwtExpiry('not-a-jwt')).toBeUndefined()
  })

  it('escapes HTML in the login page', () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;')
    const html = renderLoginPage({ loginToken: 't', clientName: '<script>x</script>' })
    expect(html).not.toContain('<script>x')
    expect(html).toContain('&lt;script&gt;')
  })

  it('shows the redirect host and marks the DCR client name unverified (F2)', () => {
    const html = renderLoginPage({
      loginToken: 't',
      clientName: 'Claude',
      redirectUri: 'https://evil.example/cb',
    })
    expect(html).toContain('evil.example')
    expect(html).toContain('unverified')
  })

  it('shows the full redirect URI when it has no host (F2)', () => {
    const html = renderLoginPage({ loginToken: 't', redirectUri: 'com.example.app:/cb' })
    expect(html).toContain('com.example.app:/cb')
  })
})

// ---------------------------------------------------------------------------

function makeProvider(apiAuth: Partial<ApiAuth>, now = () => 1_000_000) {
  const sealer = new Sealer(SECRET, now)
  return new GymOAuthProvider({ sealer, apiAuth: apiAuth as ApiAuth, resourceUrl: RESOURCE })
}

async function register(p: GymOAuthProvider, method = 'client_secret_post'): Promise<OAuthClientInformationFull> {
  return p.clientsStore.registerClient!({
    redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
    token_endpoint_auth_method: method,
    client_name: 'Claude',
  } as OAuthClientInformationFull)
}

/** Drive authorize → completeLogin and return the issued code. */
async function obtainCode(p: GymOAuthProvider, client: OAuthClientInformationFull): Promise<string> {
  let html = ''
  const res = {
    status: () => res,
    set: () => res,
    send: (h: string) => {
      html = h
      return res
    },
  }
  await p.authorize(
    client,
    { redirectUri: client.redirect_uris[0] as string, codeChallenge: 'chal', state: 'st' },
    res as never,
  )
  const loginToken = /name="login_token" value="([^"]+)"/.exec(html)![1]
  const result = await p.completeLogin(loginToken, 'lifter', 'pw')
  expect(result.kind).toBe('redirect')
  const url = new URL((result as { location: string }).location)
  expect(url.origin + url.pathname).toBe('https://claude.ai/api/mcp/auth_callback')
  expect(url.searchParams.get('state')).toBe('st')
  return url.searchParams.get('code')!
}

describe('GymOAuthProvider', () => {
  const apiTokens = { token: fakeJwt(1_000_000 + 3600), refresh_token: 'api-rt-1' }

  it('registers stateless clients that round-trip through getClient', async () => {
    const p = makeProvider({})
    const client = await register(p)
    expect(client.client_secret).toBeTruthy()
    const again = await p.clientsStore.getClient(client.client_id)
    expect(again).toMatchObject({
      client_id: client.client_id,
      client_secret: client.client_secret,
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      client_name: 'Claude',
    })
    expect(await p.clientsStore.getClient('forged')).toBeUndefined()
    const pub = await register(p, 'none')
    expect(pub.client_secret).toBeUndefined()
  })

  it('logs in, exchanges the code once, and verifies the access token', async () => {
    const login = vi.fn().mockResolvedValue(apiTokens)
    const p = makeProvider({ login })
    const client = await register(p)
    const code = await obtainCode(p, client)
    expect(login).toHaveBeenCalledWith('lifter', 'pw')

    expect(await p.challengeForAuthorizationCode(client, code)).toBe('chal')
    const tokens = await p.exchangeAuthorizationCode(client, code, 'v', client.redirect_uris[0] as string, RESOURCE)
    expect(tokens.expires_in).toBe(3600)
    expect(tokens.access_token).not.toContain(apiTokens.token)

    const info = await p.verifyAccessToken(tokens.access_token)
    expect(info).toMatchObject({ clientId: client.client_id, expiresAt: 1_000_000 + 3600 })
    expect(info.resource?.href).toBe(RESOURCE.href)
    expect(info.extra?.apiToken).toBe(apiTokens.token)

    await expect(p.exchangeAuthorizationCode(client, code)).rejects.toThrow(/already been used/)
  })

  it('rejects a code presented by another client or with another redirect_uri', async () => {
    const p = makeProvider({ login: vi.fn().mockResolvedValue(apiTokens) })
    const client = await register(p)
    const other = await register(p)
    const code = await obtainCode(p, client)
    await expect(p.challengeForAuthorizationCode(other, code)).rejects.toThrow(/Invalid or expired/)
    await expect(p.exchangeAuthorizationCode(client, code, 'v', 'https://evil.test/cb')).rejects.toThrow(
      /redirect_uri/,
    )
  })

  it('re-renders the form on bad credentials', async () => {
    const p = makeProvider({ login: vi.fn().mockRejectedValue(new GymApiError(401, 'bad')) })
    const client = await register(p)
    let html = ''
    const res = { status: () => res, set: () => res, send: (h: string) => ((html = h), res) }
    await p.authorize(client, { redirectUri: client.redirect_uris[0] as string, codeChallenge: 'c' }, res as never)
    const loginToken = /name="login_token" value="([^"]+)"/.exec(html)![1]
    const result = await p.completeLogin(loginToken, 'lifter', 'nope')
    expect(result).toMatchObject({ kind: 'page', status: 401 })
    expect((result as { html: string }).html).toContain('Incorrect email/username or password')
  })

  it('refuses tokens for a different resource', async () => {
    const p = makeProvider({})
    const client = await register(p)
    const res = { status: () => res, set: () => res, send: () => res }
    await expect(
      p.authorize(
        client,
        { redirectUri: client.redirect_uris[0] as string, codeChallenge: 'c', resource: new URL('https://other.test/mcp') },
        res as never,
      ),
    ).rejects.toThrow(/own MCP endpoint/)
  })

  it('rotates the API refresh token on refresh and rejects a spent one', async () => {
    const refresh = vi
      .fn()
      .mockResolvedValueOnce({ token: fakeJwt(1_000_000 + 7200), refresh_token: 'api-rt-2' })
      .mockRejectedValueOnce(new GymApiError(401, 'reused'))
    const p = makeProvider({ login: vi.fn().mockResolvedValue(apiTokens), refresh })
    const client = await register(p)
    const first = await p.exchangeAuthorizationCode(client, await obtainCode(p, client))

    const second = await p.exchangeRefreshToken(client, first.refresh_token!)
    expect(refresh).toHaveBeenCalledWith('api-rt-1')
    expect(second.expires_in).toBe(7200)
    expect((await p.verifyAccessToken(second.access_token)).extra?.apiToken).toContain('.')

    await expect(p.exchangeRefreshToken(client, second.refresh_token!)).rejects.toThrow(/sign in again/)
    const other = await register(p)
    await expect(p.exchangeRefreshToken(other, second.refresh_token!)).rejects.toThrow(/Invalid or expired/)
  })

  it('rejects an expired access token and a refresh token used as an access token', async () => {
    let now = 1_000_000
    const p = makeProvider({ login: vi.fn().mockResolvedValue(apiTokens) }, () => now)
    const client = await register(p)
    const tokens = await p.exchangeAuthorizationCode(client, await obtainCode(p, client))
    await expect(p.verifyAccessToken(tokens.refresh_token!)).rejects.toThrow(/Invalid or expired/)
    now += 3601
    await expect(p.verifyAccessToken(tokens.access_token)).rejects.toThrow(/Invalid or expired/)
  })

  // ---- F1: a replayed refresh must never re-forward the spent API token -----

  /** A mock API that rotates refresh tokens and — like the real API — revokes
   *  everything the moment an already-rotated token is presented again. */
  function refreshMock() {
    const state = { current: 'api-rt-1', calls: 0, revokedAll: false }
    const refresh = vi.fn(async (token: string) => {
      state.calls++
      if (token !== state.current) {
        state.revokedAll = true
        throw new GymApiError(401, 'refresh token reused')
      }
      state.current = `api-rt-${state.calls + 1}`
      return { token: fakeJwt(1_000_000 + 7200), refresh_token: state.current }
    })
    return { state, refresh }
  }

  it('serves a retried refresh from cache without re-forwarding or revoking all (F1)', async () => {
    const { state, refresh } = refreshMock()
    const p = makeProvider({ login: vi.fn().mockResolvedValue(apiTokens), refresh })
    const client = await register(p)
    const first = await p.exchangeAuthorizationCode(client, await obtainCode(p, client))

    const a = await p.exchangeRefreshToken(client, first.refresh_token!)
    const b = await p.exchangeRefreshToken(client, first.refresh_token!) // replay (lost response)
    expect(state.calls).toBe(1) // forwarded to the API exactly once
    expect(b.access_token).toBe(a.access_token)
    expect(b.refresh_token).toBe(a.refresh_token)
    expect(state.revokedAll).toBe(false)
  })

  it('shares one API call across concurrent refreshes of the same token (F1)', async () => {
    const { state, refresh } = refreshMock()
    const p = makeProvider({ login: vi.fn().mockResolvedValue(apiTokens), refresh })
    const client = await register(p)
    const first = await p.exchangeAuthorizationCode(client, await obtainCode(p, client))
    const [x, y] = await Promise.all([
      p.exchangeRefreshToken(client, first.refresh_token!),
      p.exchangeRefreshToken(client, first.refresh_token!),
    ])
    expect(state.calls).toBe(1)
    expect(state.revokedAll).toBe(false)
    expect(x.refresh_token).toBe(y.refresh_token)
  })

  it('marks the jti used after an ambiguous API failure so a retry is not re-forwarded (F1)', async () => {
    // The API may have rotated the token before a 5xx/timeout reached us; a retry
    // must be rejected locally rather than re-forwarding the (possibly spent) token.
    const refresh = vi.fn().mockRejectedValueOnce(new GymApiError(502, 'bad gateway'))
    const p = makeProvider({ login: vi.fn().mockResolvedValue(apiTokens), refresh })
    const client = await register(p)
    const first = await p.exchangeAuthorizationCode(client, await obtainCode(p, client))
    await expect(p.exchangeRefreshToken(client, first.refresh_token!)).rejects.toThrow(/bad gateway/)
    await expect(p.exchangeRefreshToken(client, first.refresh_token!)).rejects.toThrow(/already used/)
    expect(refresh).toHaveBeenCalledTimes(1) // never re-forwarded after the failure
  })

  it('rejects a replayed refresh after the grace window without calling the API (F1)', async () => {
    let now = 1_000_000
    const { state, refresh } = refreshMock()
    const p = makeProvider({ login: vi.fn().mockResolvedValue(apiTokens), refresh }, () => now)
    const client = await register(p)
    const first = await p.exchangeAuthorizationCode(client, await obtainCode(p, client))
    await p.exchangeRefreshToken(client, first.refresh_token!)
    now += 61 // past the 60s grace window
    await expect(p.exchangeRefreshToken(client, first.refresh_token!)).rejects.toThrow(/already used/)
    expect(state.calls).toBe(1) // never re-forwarded
    expect(state.revokedAll).toBe(false)
  })

  // ---- F6 / F7: scopes, revocation, login-state edge cases ------------------

  it('grants only supported scopes and drops unknown ones (F6)', async () => {
    const p = makeProvider({ login: vi.fn().mockResolvedValue(apiTokens) })
    const client = await register(p)
    let html = ''
    const res = { status: () => res, set: () => res, send: (h: string) => ((html = h), res) }
    await p.authorize(
      client,
      { redirectUri: client.redirect_uris[0] as string, codeChallenge: 'c', scopes: ['read', 'write', 'admin'] },
      res as never,
    )
    const loginToken = /name="login_token" value="([^"]+)"/.exec(html)![1]
    const r = await p.completeLogin(loginToken, 'lifter', 'pw')
    const code = new URL((r as { location: string }).location).searchParams.get('code')!
    const tokens = await p.exchangeAuthorizationCode(client, code)
    expect(tokens.scope).toBe('read')
    expect((await p.verifyAccessToken(tokens.access_token)).scopes).toEqual(['read'])
  })

  it('revokes by logging the API session out, and no-ops for a foreign or invalid token (F7)', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    const p = makeProvider({ login: vi.fn().mockResolvedValue(apiTokens), logout })
    const client = await register(p)
    const tokens = await p.exchangeAuthorizationCode(client, await obtainCode(p, client))
    await p.revokeToken(client, { token: tokens.refresh_token! })
    expect(logout).toHaveBeenCalledWith('api-rt-1')
    logout.mockClear()
    const other = await register(p)
    await p.revokeToken(other, { token: tokens.refresh_token! }) // different client → no-op
    await p.revokeToken(client, { token: 'garbage' }) // not a refresh token → no-op
    expect(logout).not.toHaveBeenCalled()
  })

  it('rejects an expired login link at completeLogin (F7)', async () => {
    let now = 1_000_000
    const p = makeProvider({ login: vi.fn().mockResolvedValue(apiTokens) }, () => now)
    const client = await register(p)
    let html = ''
    const res = { status: () => res, set: () => res, send: (h: string) => ((html = h), res) }
    await p.authorize(client, { redirectUri: client.redirect_uris[0] as string, codeChallenge: 'c' }, res as never)
    const loginToken = /name="login_token" value="([^"]+)"/.exec(html)![1]
    now += LOGIN_STATE_TTL_SECONDS + 1
    const expired = await p.completeLogin(loginToken, 'lifter', 'pw')
    expect(expired).toMatchObject({ kind: 'page', status: 400 })
    expect((expired as { html: string }).html).toContain('expired')
  })

  it('rejects an unknown client at completeLogin (F7)', async () => {
    const sealer = new Sealer(SECRET, () => 1_000_000)
    const p = new GymOAuthProvider({ sealer, apiAuth: {} as ApiAuth, resourceUrl: RESOURCE })
    // A validly-sealed login state that points at a client id which does not open.
    const loginToken = sealer.seal(
      'login',
      { c: 'not-a-real-client', r: 'https://claude.ai/api/mcp/auth_callback', ch: 'c', sc: [], rs: RESOURCE.href },
      600,
    )
    const result = await p.completeLogin(loginToken, 'lifter', 'pw')
    expect(result).toMatchObject({ kind: 'page', status: 400 })
    expect((result as { html: string }).html).toContain('Unknown client')
  })

  it('enforces a DCR redirect_uri allowlist when configured (F2)', async () => {
    const p = new GymOAuthProvider({
      sealer: new Sealer(SECRET),
      apiAuth: {} as ApiAuth,
      resourceUrl: RESOURCE,
      allowedRedirectUris: ['https://claude.ai/api/mcp/auth_callback'],
    })
    expect(() =>
      p.clientsStore.registerClient!({
        redirect_uris: ['https://evil.example/cb'],
        token_endpoint_auth_method: 'none',
      } as OAuthClientInformationFull),
    ).toThrow(/not allowed/)
    const ok = p.clientsStore.registerClient!({
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      token_endpoint_auth_method: 'none',
    } as OAuthClientInformationFull)
    expect(ok.client_id).toBeTruthy()
  })
})
