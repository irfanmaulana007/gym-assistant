import { describe, it, expect, vi, beforeEach } from 'vitest'

// Partial-mock the SDK so captureException is a spy; everything else stays real.
vi.mock('@sentry/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sentry/node')>()
  return { ...actual, captureException: vi.fn(() => 'event-id') }
})

import * as Sentry from '@sentry/node'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { createServer } from '@/server'
import type { Config } from '@/config'

const captureMock = vi.mocked(Sentry.captureException)

// F2: the stdio tool handler catches its own errors (there is no Express error
// handler in stdio mode), so it must report unexpected failures to Sentry while
// NOT reporting expected upstream API responses (a 404 is a normal tool
// outcome). These tests inject a failing / 404 fetchImpl and assert that
// behavior through an in-memory MCP client.

const CONFIG: Config = {
  baseUrl: 'https://api.example.test',
  token: 'test-token',
  timeoutMs: 5_000,
}

async function connect(fetchImpl: typeof fetch): Promise<Client> {
  const server = createServer(CONFIG, fetchImpl)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const client = new Client({ name: 'test', version: '0.0.0' })
  await client.connect(clientTransport)
  return client
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('createServer tool error handling + Sentry (stdio mode)', () => {
  beforeEach(() => {
    captureMock.mockClear()
  })

  it('reports a transport failure to Sentry and still returns a tool error', async () => {
    // A rejecting fetch is normalized by the client into a GymApiError with
    // status 0 (network error) — an MCP-side incident worth capturing.
    const failing: typeof fetch = () => Promise.reject(new TypeError('network down'))

    const client = await connect(failing)
    try {
      const result = (await client.callTool({ name: 'get_profile', arguments: {} })) as {
        isError?: boolean
      }
      expect(result.isError).toBe(true)
      expect(captureMock).toHaveBeenCalledTimes(1)
    } finally {
      await client.close()
    }
  })

  it('does NOT report an expected upstream API error (404) to Sentry', async () => {
    const notFound: typeof fetch = () =>
      Promise.resolve(jsonResponse({ error: { code: 'not_found', message: 'nope' } }, 404))

    const client = await connect(notFound)
    try {
      const result = (await client.callTool({ name: 'get_profile', arguments: {} })) as {
        isError?: boolean
      }
      expect(result.isError).toBe(true)
      expect(captureMock).not.toHaveBeenCalled()
    } finally {
      await client.close()
    }
  })
})
