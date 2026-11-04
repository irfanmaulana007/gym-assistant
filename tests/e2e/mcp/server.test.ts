import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// A self-contained mock of the Gym Assistant API on an ephemeral port — never
// the real API and never a dev port (per .claude/rules/testing.md).

const MISSING_UUID = '00000000-0000-4000-8000-000000000000'
const SESSION_UUID = '22222222-2222-4222-8222-222222222222'
const PROFILE = { id: 'u1', display_name: 'Test Lifter', preferred_weight_unit: 'kg' }
const SESSIONS = {
  sessions: [{ id: SESSION_UUID, status: 'completed', performed_at: '2026-10-01T00:00:00Z' }],
}
const SESSION_DETAIL = {
  id: SESSION_UUID,
  status: 'completed',
  exercises: [{ id: 'se1', name_snapshot: 'Bench Press', entries: [{ weight: 60, reps: 8 }] }],
}

let server: Server
let baseUrl: string
const seenAuthHeaders: string[] = []

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const auth = req.headers['authorization']
    if (typeof auth === 'string') seenAuthHeaders.push(auth)
    const url = new URL(req.url ?? '/', 'http://localhost')

    if (req.method === 'GET' && url.pathname === '/api/v1/auth/me') return send(res, 200, PROFILE)
    if (req.method === 'GET' && url.pathname === '/api/v1/sessions') return send(res, 200, SESSIONS)
    if (req.method === 'GET' && url.pathname === `/api/v1/sessions/${SESSION_UUID}`)
      return send(res, 200, SESSION_DETAIL)
    if (req.method === 'GET' && url.pathname === `/api/v1/routines/${MISSING_UUID}`)
      return send(res, 404, { error: { code: 'not_found', message: 'routine not found' } })

    return send(res, 404, { error: { code: 'not_found', message: 'unexpected path' } })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

async function connectClient(): Promise<Client> {
  const indexTs = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../apps/mcp/src/index.ts',
  )
  // Run the real entrypoint over stdio via tsx, just like a configured client.
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', indexTs],
    env: {
      ...(process.env as Record<string, string>),
      GYM_API_BASE_URL: baseUrl,
      GYM_API_TOKEN: 'test-token',
    },
  })
  const client = new Client({ name: 'test', version: '0.0.0' })
  await client.connect(transport)
  return client
}

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.map((c) => c.text ?? '').join('')
}

describe('gym-assistant MCP server (stdio, end-to-end)', () => {
  it('exposes the read-only tool surface', async () => {
    const client = await connectClient()
    try {
      const { tools } = await client.listTools()
      const names = tools.map((t) => t.name)
      expect(names).toContain('get_profile')
      expect(names).toContain('list_sessions')
      expect(names).toContain('get_session')
      expect(names).toContain('get_exercise_history')
      expect(names).toContain('get_analytics_dashboard')
    } finally {
      await client.close()
    }
  })

  it('reads the profile and forwards the bearer token', async () => {
    const client = await connectClient()
    try {
      const result = (await client.callTool({ name: 'get_profile', arguments: {} })) as {
        content: Array<{ type: string; text?: string }>
      }
      const data = JSON.parse(textOf(result))
      expect(data).toMatchObject({ display_name: 'Test Lifter' })
      expect(seenAuthHeaders).toContain('Bearer test-token')
    } finally {
      await client.close()
    }
  })

  it('reads a full session by id', async () => {
    const client = await connectClient()
    try {
      const result = (await client.callTool({
        name: 'get_session',
        arguments: { session_id: SESSION_UUID },
      })) as { content: Array<{ type: string; text?: string }> }
      const data = JSON.parse(textOf(result))
      expect(data.exercises[0].name_snapshot).toBe('Bench Press')
    } finally {
      await client.close()
    }
  })

  it('surfaces an API 404 as a tool error', async () => {
    const client = await connectClient()
    try {
      const result = (await client.callTool({
        name: 'get_routine',
        arguments: { routine_id: MISSING_UUID },
      })) as { isError?: boolean; content: Array<{ type: string; text?: string }> }
      expect(result.isError).toBe(true)
      expect(textOf(result)).toMatch(/404/)
    } finally {
      await client.close()
    }
  })
})
