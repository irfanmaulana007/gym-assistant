import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHttpApp } from '@/http'
import type { HttpConfig } from '@/config'

// End-to-end check that the remote (HTTP) MCP app — which now registers the
// Sentry Express error handler as its last middleware — still boots and serves
// a request end-to-end. SENTRY_DSN is unset here, so Sentry is a no-op; this
// proves the error-handler wiring does not break the server. Runs on an
// ephemeral port, never a dev port.

const config: HttpConfig = {
  baseUrl: 'https://api.example.test',
  timeoutMs: 15_000,
  publicUrl: 'https://mcp.example.test',
  oauthSecret: 'test-oauth-secret-at-least-32-chars-long!!',
  port: 0,
  trustProxy: 0,
  allowedRedirectUris: [],
}

let server: Server
let base: string

beforeAll(async () => {
  const app = createHttpApp(config, { disableRateLimits: true })
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo
      base = `http://127.0.0.1:${port}`
      resolve()
    })
  })
})

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve())
    }),
)

describe('remote MCP HTTP app with Sentry error handler', () => {
  it('still serves /healthz (Sentry wiring does not break the server)', async () => {
    const res = await fetch(`${base}/healthz`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })
})
