import { describe, it, expect, vi } from 'vitest'
import { Sealer } from '@/oauth/seal'
import { ApiAuth, jwtExpiry } from '@/oauth/apiAuth'
import { GymOAuthProvider } from '@/oauth/provider'
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
      trustProxy: 1,
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
})
