import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHash, randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createHttpApp } from '@/http'

// Full remote-mode flow (PRD 0023): a mock Gym Assistant API and the real HTTP
// app, both on ephemeral ports — never production, never a dev port.

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'
const PROFILE = { id: 'u1', display_name: 'Test Lifter' }

function jwt(tag: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600, tag })}.sig`
}

let api: Server
let mcp: Server
let apiUrl: string
let mcpBase: string
const validApiTokens = new Set<string>()
let currentRefresh = 'rt-1'
const spentRefresh = new Set<string>()
let apiRevokedAll = false
const seenApiAuth: string[] = []

function send(res: ServerResponse, status: number, body?: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<Record<string, string>> {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw ? JSON.parse(raw) : {}
}

beforeAll(async () => {
  api = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (req.method === 'POST' && url.pathname === '/api/v1/auth/login') {
      const body = await readJson(req)
      if (body.identifier !== 'lifter' || body.password !== 'pw')
        return send(res, 401, { error: { code: 'unauthorized', message: 'invalid credentials' } })
      const token = jwt('login')
      validApiTokens.add(token)
      return send(res, 200, { token, refresh_token: currentRefresh, user: PROFILE })
    }
    if (req.method === 'POST' && url.pathname === '/api/v1/auth/refresh') {
      const body = await readJson(req)
      if (body.refresh_token !== currentRefresh) {
        // Model the real API: presenting an already-rotated token is treated as
        // theft and revokes every session the user has.
        if (spentRefresh.has(body.refresh_token)) {
          apiRevokedAll = true
          validApiTokens.clear()
        }
        return send(res, 401, { error: { code: 'unauthorized', message: 'refresh token reused' } })
      }
      spentRefresh.add(currentRefresh)
      currentRefresh = `rt-${spentRefresh.size}`
      const token = jwt('refresh')
      validApiTokens.add(token)
      return send(res, 200, { token, refresh_token: currentRefresh, user: PROFILE })
    }
    const auth = req.headers.authorization ?? ''
    seenApiAuth.push(auth)
    if (!validApiTokens.has(auth.replace(/^Bearer /, '')))
      return send(res, 401, { error: { code: 'unauthorized', message: 'bad token' } })
    if (req.method === 'GET' && url.pathname === '/api/v1/auth/me') return send(res, 200, PROFILE)
    return send(res, 404, { error: { code: 'not_found', message: 'unexpected path' } })
  })
  await new Promise<void>((r) => api.listen(0, '127.0.0.1', r))
  apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`

  mcp = createServer()
  await new Promise<void>((r) => mcp.listen(0, '127.0.0.1', r))
  mcpBase = `http://127.0.0.1:${(mcp.address() as AddressInfo).port}`
  const app = createHttpApp(
    {
      baseUrl: apiUrl,
      timeoutMs: 5000,
      publicUrl: mcpBase,
      oauthSecret: randomBytes(32).toString('hex'),
      port: 0,
      trustProxy: 0,
      allowedRedirectUris: [],
    },
    { disableRateLimits: true },
  )
  mcp.on('request', app)
})

afterAll(async () => {
  await Promise.all([
    new Promise<void>((r) => api.close(() => r())),
    new Promise<void>((r) => mcp.close(() => r())),
  ])
})

const form = (data: Record<string, string>) => new URLSearchParams(data).toString()

async function register(base = mcpBase): Promise<{ client_id: string; client_secret: string }> {
  const res = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: 'Claude', token_endpoint_auth_method: 'client_secret_post' }),
  })
  expect(res.status).toBe(201)
  return res.json()
}

async function openLoginPage(clientId: string, challenge: string, base = mcpBase): Promise<{ html: string; res: Response }> {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'xyz',
    resource: `${base}/mcp`,
  })
  const res = await fetch(`${base}/authorize?${q}`, { redirect: 'manual' })
  return { html: await res.text(), res }
}

function loginTokenOf(html: string): string {
  return /name="login_token" value="([^"]+)"/.exec(html)![1]
}

async function authorizeAndGetTokens() {
  const client = await register()
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const { html, res } = await openLoginPage(client.client_id, challenge)
  expect(res.status).toBe(200)
  expect(res.headers.get('content-security-policy')).toContain("form-action 'self' https://claude.ai")

  const login = await fetch(`${mcpBase}/oauth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ login_token: loginTokenOf(html), identifier: 'lifter', password: 'pw' }),
    redirect: 'manual',
  })
  expect(login.status).toBe(302)
  const callback = new URL(login.headers.get('location')!)
  expect(callback.origin + callback.pathname).toBe(REDIRECT)
  expect(callback.searchParams.get('state')).toBe('xyz')

  const tokenRes = await fetch(`${mcpBase}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({
      grant_type: 'authorization_code',
      code: callback.searchParams.get('code')!,
      code_verifier: verifier,
      redirect_uri: REDIRECT,
      client_id: client.client_id,
      client_secret: client.client_secret,
      resource: `${mcpBase}/mcp`,
    }),
  })
  expect(tokenRes.status).toBe(200)
  const tokens = (await tokenRes.json()) as { access_token: string; refresh_token: string; expires_in: number }
  return { client, tokens }
}

async function callProfile(accessToken: string): Promise<string> {
  const transport = new StreamableHTTPClientTransport(new URL(`${mcpBase}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
  const client = new Client({ name: 'e2e', version: '0.0.0' })
  await client.connect(transport)
  try {
    const tools = await client.listTools()
    expect(tools.tools.map((t) => t.name)).toContain('get_profile')
    const result = (await client.callTool({ name: 'get_profile', arguments: {} })) as {
      content: Array<{ text?: string }>
      isError?: boolean
    }
    expect(result.isError).toBeFalsy()
    return result.content.map((c) => c.text ?? '').join('')
  } finally {
    await client.close()
  }
}

describe('remote MCP over Streamable HTTP + OAuth', () => {
  it('advertises protected-resource and authorization-server metadata', async () => {
    const prm = await (await fetch(`${mcpBase}/.well-known/oauth-protected-resource/mcp`)).json()
    expect(prm.resource).toBe(`${mcpBase}/mcp`)
    const asm = await (await fetch(`${mcpBase}/.well-known/oauth-authorization-server`)).json()
    expect(asm).toMatchObject({
      issuer: `${mcpBase}/`,
      registration_endpoint: `${mcpBase}/register`,
      code_challenge_methods_supported: ['S256'],
    })
  })

  it('rejects unauthenticated MCP requests with a discoverable 401', async () => {
    const res = await fetch(`${mcpBase}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain('/.well-known/oauth-protected-resource/mcp')
  })

  it('re-renders the login form on a wrong password', async () => {
    const client = await register()
    const { html } = await openLoginPage(client.client_id, 'a'.repeat(43))
    const res = await fetch(`${mcpBase}/oauth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ login_token: loginTokenOf(html), identifier: 'lifter', password: 'wrong' }),
      redirect: 'manual',
    })
    expect(res.status).toBe(401)
    expect(await res.text()).toContain('Incorrect email/username or password')
  })

  it('completes the OAuth flow, reads data as the user, and refreshes', async () => {
    const { client, tokens } = await authorizeAndGetTokens()
    expect(tokens.expires_in).toBeGreaterThan(3500)

    const text = await callProfile(tokens.access_token)
    expect(text).toContain('Test Lifter')
    // The API received the user's real JWT, not the opaque OAuth token.
    expect(validApiTokens.has(seenApiAuth.at(-1)!.replace(/^Bearer /, ''))).toBe(true)

    const refreshRes = await fetch(`${mcpBase}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: client.client_id,
        client_secret: client.client_secret,
      }),
    })
    expect(refreshRes.status).toBe(200)
    const refreshed = (await refreshRes.json()) as { access_token: string }
    expect(await callProfile(refreshed.access_token)).toContain('Test Lifter')
  })

  it('does not log the user out when the same refresh token is replayed (F1)', async () => {
    const { client, tokens } = await authorizeAndGetTokens()
    const refresh = (rt: string) =>
      fetch(`${mcpBase}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({
          grant_type: 'refresh_token',
          refresh_token: rt,
          client_id: client.client_id,
          client_secret: client.client_secret,
        }),
      })

    const firstRes = await refresh(tokens.refresh_token)
    expect(firstRes.status).toBe(200)
    const first = (await firstRes.json()) as { access_token: string; refresh_token: string }

    // Replay the ORIGINAL refresh token (a retry / lost response). The provider
    // must serve the rotated pair from cache and never re-forward the now-spent
    // API token — so the API's revoke-all is never triggered.
    const replayRes = await refresh(tokens.refresh_token)
    expect(replayRes.status).toBe(200)
    const replay = (await replayRes.json()) as { refresh_token: string }
    expect(replay.refresh_token).toBe(first.refresh_token)
    expect(apiRevokedAll).toBe(false)
    // The access token from the single real rotation still works.
    expect(await callProfile(first.access_token)).toContain('Test Lifter')
  })

  it('rejects a tampered access token', async () => {
    const { tokens } = await authorizeAndGetTokens()
    const res = await fetch(`${mcpBase}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${tokens.access_token.slice(0, -4)}AAAA`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(res.status).toBe(401)
  })
})

// App instances with rate limits ENABLED, to exercise the login limiters (the
// main suite disables them). Each test gets its OWN app so the in-memory limiter
// stores start empty — express-rate-limit keys on IP, so sharing one app would
// bleed counts (and the per-IP backstop) between tests.
describe('remote MCP login rate limiting', () => {
  async function startApp(): Promise<{ server: Server; base: string }> {
    const server = createServer()
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const app = createHttpApp({
      baseUrl: apiUrl,
      timeoutMs: 5000,
      publicUrl: base,
      oauthSecret: randomBytes(32).toString('hex'),
      port: 0,
      trustProxy: 0,
      allowedRedirectUris: [],
    })
    server.on('request', app)
    return { server, base }
  }

  /** A reusable POST /oauth/login attempt bound to one app + login_token. */
  async function attempterFor(base: string): Promise<(id: string, pw: string) => Promise<Response>> {
    const client = await register(base)
    const { html } = await openLoginPage(client.client_id, 'a'.repeat(43), base)
    const token = loginTokenOf(html)
    return (identifier: string, password: string) =>
      fetch(`${base}/oauth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ login_token: token, identifier, password }),
        redirect: 'manual',
      })
  }

  it('throttles repeated failed logins per identifier with a friendly 429 (F8)', async () => {
    const { server, base } = await startApp()
    try {
      const attempt = await attempterFor(base)
      // 10 failures are allowed, the 11th is throttled with a friendly 429 page.
      let status = 0
      for (let i = 0; i < 11; i++) status = (await attempt('victim', 'wrong')).status
      expect(status).toBe(429)
      const throttled = await attempt('victim', 'wrong')
      expect(throttled.status).toBe(429)
      expect(await throttled.text()).toContain('Too many attempts')
      // A different identifier is a different (identifier, IP) bucket.
      expect((await attempt('lifter', 'pw')).status).toBe(302)
    } finally {
      await new Promise<void>((r) => server.close(() => r()))
    }
  })

  it('does not count a successful login against the per-identifier limit (F7)', async () => {
    const { server, base } = await startApp()
    try {
      const attempt = await attempterFor(base)
      // 9 failures for `lifter`, then a success (302), then more failures. If the
      // success were counted, the 10th *failure* would be the 11th request in the
      // bucket and get a 429; skipSuccessfulRequests means it is still a 401.
      for (let i = 0; i < 9; i++) expect((await attempt('lifter', 'wrong')).status).toBe(401)
      expect((await attempt('lifter', 'pw')).status).toBe(302)
      expect((await attempt('lifter', 'wrong')).status).toBe(401) // 10th failure, not throttled
      expect((await attempt('lifter', 'wrong')).status).toBe(429) // 11th failure, throttled
    } finally {
      await new Promise<void>((r) => server.close(() => r()))
    }
  })

  it('trips the per-IP backstop limiter across distinct identifiers (F7)', async () => {
    const { server, base } = await startApp()
    try {
      const attempt = await attempterFor(base)
      // Distinct identifiers each have their own (identifier, IP) bucket, so only
      // the per-IP backstop (20 / 15 min) can stop them — the 21st request trips it.
      let status = 0
      for (let i = 0; i < 21; i++) status = (await attempt(`u${i}`, 'wrong')).status
      expect(status).toBe(429)
    } finally {
      await new Promise<void>((r) => server.close(() => r()))
    }
  })
})
