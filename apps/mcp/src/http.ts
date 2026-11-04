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
import { rateLimit } from 'express-rate-limit'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js'
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js'
import type { HttpConfig } from './config.js'
import { createServer } from './server.js'
import { ApiAuth } from './oauth/apiAuth.js'
import { GymOAuthProvider, sendLoginPage } from './oauth/provider.js'
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

  const loginLimiter = opts.disableRateLimits
    ? (_req: Request, _res: Response, next: () => void) => next()
    : rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false })

  app.post(
    '/oauth/login',
    loginLimiter,
    express.urlencoded({ extended: false, limit: '16kb' }),
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
