/**
 * Remote mode (PRD 0023): the same read-only tools over MCP Streamable HTTP,
 * protected by OAuth 2.1. This server is both the authorization server
 * (DCR, /authorize + login page, /token) and the resource server (/mcp).
 *
 * Each POST /mcp runs statelessly: a fresh McpServer + GymApiClient is built
 * with the caller's own API token, so requests are always scoped to the user
 * who authorized the connector.
 */

import express, { type Express, type Request, type Response } from 'express'
import { rateLimit, ipKeyGenerator } from 'express-rate-limit'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js'
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js'
import type { HttpConfig } from './config.js'
import { createServer } from './server.js'
import { ApiAuth } from './oauth/apiAuth.js'
import { GymOAuthProvider, SUPPORTED_SCOPES, sendLoginPage } from './oauth/provider.js'
import { renderLoginPage } from './oauth/loginPage.js'
import { Sealer } from './oauth/seal.js'

export interface HttpAppOptions {
  fetchImpl?: typeof fetch
  /** Disable the SDK + login rate limiters (tests only). */
  disableRateLimits?: boolean
}

export function createHttpApp(config: HttpConfig, opts: HttpAppOptions = {}): Express {
  const issuerUrl = new URL(config.publicUrl)
  const mcpUrl = new URL('/mcp', issuerUrl)

  const provider = new GymOAuthProvider({
    sealer: new Sealer(config.oauthSecret),
    apiAuth: new ApiAuth({ baseUrl: config.baseUrl, timeoutMs: config.timeoutMs, fetchImpl: opts.fetchImpl }),
    resourceUrl: mcpUrl,
    allowedRedirectUris: config.allowedRedirectUris,
  })

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', config.trustProxy)

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' })
  })

  const limit = opts.disableRateLimits ? false : undefined
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl,
      resourceServerUrl: mcpUrl,
      resourceName: 'Gym Assistant (read-only)',
      scopesSupported: SUPPORTED_SCOPES,
      // Stateless client ids never expire; rotating MCP_OAUTH_SECRET revokes them.
      clientRegistrationOptions: { clientSecretExpirySeconds: 0, ...(limit === false ? { rateLimit: false } : {}) },
      ...(limit === false
        ? {
            authorizationOptions: { rateLimit: false },
            tokenOptions: { rateLimit: false },
            revocationOptions: { rateLimit: false },
          }
        : {}),
    }),
  )

  const passthrough = (_req: Request, _res: Response, next: () => void) => next()
  const loginIdentifier = (req: Request): string => {
    const raw = (req.body as Record<string, unknown> | undefined)?.identifier
    return typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  }
  // Re-render the sign-in page with a friendly message instead of the bare
  // express-rate-limit text body, keeping the flow usable when a limiter trips.
  const throttledPage = (req: Request, res: Response) => {
    const token = (req.body as Record<string, unknown> | undefined)?.login_token
    sendLoginPage(
      res,
      429,
      renderLoginPage({
        loginToken: typeof token === 'string' ? token : '',
        error: 'Too many attempts. Wait a few minutes and try again.',
      }),
    )
  }

  // Per-IP backstop. Runs before the body is parsed, so it cannot render the
  // friendly page (no login_token yet) and returns express-rate-limit's plain
  // 429. With `trust proxy` 0 it keys on the real socket address, which cannot be
  // spoofed via X-Forwarded-For. Skips successful logins so several users behind
  // one NAT IP don't exhaust it just by signing in.
  const loginLimiter = opts.disableRateLimits
    ? passthrough
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 20,
        skipSuccessfulRequests: true,
        standardHeaders: true,
        legacyHeaders: false,
      })
  // Strict per-(identifier, IP) limiter: throttles guessing against one account
  // from one source without letting an attacker's IP exhaust the victim's own
  // bucket (so it can't be used to lock a user out of connecting).
  const identifierLimiter = opts.disableRateLimits
    ? passthrough
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        skipSuccessfulRequests: true,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req: Request) => `${loginIdentifier(req)}|${ipKeyGenerator(req.ip ?? '')}`,
        handler: throttledPage,
      })
  // Looser account-wide limiter: bounds distributed guessing across many IPs
  // against one account (the Go API has no login throttle of its own). Keyed on
  // the identifier alone, so it is a deliberate, weaker lockout lever — someone
  // who knows a username can hold that account at 429 with 50 failed attempts an
  // hour. That trade-off (vs. unbounded guessing) is documented in PRD 0023.
  const accountLimiter = opts.disableRateLimits
    ? passthrough
    : rateLimit({
        windowMs: 60 * 60 * 1000,
        limit: 50,
        skipSuccessfulRequests: true,
        standardHeaders: false,
        legacyHeaders: false,
        keyGenerator: (req: Request) => {
          const id = loginIdentifier(req)
          return id ? `acct:${id}` : `ip:${ipKeyGenerator(req.ip ?? '')}`
        },
        handler: throttledPage,
      })

  app.post(
    '/oauth/login',
    loginLimiter,
    express.urlencoded({ extended: false, limit: '16kb' }),
    identifierLimiter,
    accountLimiter,
    async (req: Request, res: Response) => {
      const body = (req.body ?? {}) as Record<string, unknown>
      const str = (v: unknown) => (typeof v === 'string' ? v : '')
      try {
        const result = await provider.completeLogin(str(body.login_token), str(body.identifier), str(body.password))
        if (result.kind === 'redirect') {
          res.set('Cache-Control', 'no-store').redirect(302, result.location)
          return
        }
        sendLoginPage(res, result.status, result.html, result.redirectUri)
      } catch (err) {
        process.stderr.write(`login handler error: ${err instanceof Error ? err.message : String(err)}\n`)
        res.status(500).type('text/plain').send('Internal error')
      }
    },
  )

  const bearer = requireBearerAuth({
    verifier: provider,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
    expectedResource: mcpUrl,
  })

  app.post('/mcp', bearer, express.json({ limit: '1mb' }), async (req: Request, res: Response) => {
    const apiToken = req.auth?.extra?.apiToken
    if (typeof apiToken !== 'string') {
      res.status(401).json({ error: 'invalid_token' })
      return
    }
    const server = createServer(
      { baseUrl: config.baseUrl, timeoutMs: config.timeoutMs, token: apiToken },
      opts.fetchImpl,
    )
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    res.on('close', () => {
      void transport.close()
      void server.close()
    })
    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (err) {
      process.stderr.write(`mcp request error: ${err instanceof Error ? err.message : String(err)}\n`)
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null })
      }
    }
  })

  // Stateless server: no SSE stream to resume and no session to delete.
  const methodNotAllowed = (_req: Request, res: Response) => {
    res
      .status(405)
      .set('Allow', 'POST')
      .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null })
  }
  app.get('/mcp', methodNotAllowed)
  app.delete('/mcp', methodNotAllowed)

  return app
}
