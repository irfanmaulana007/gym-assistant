/**
 * Builds the MCP server and registers every read-only tool. Kept transport-
 * agnostic so tests can connect an in-memory/stdio client to the same server.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { GymApiClient, GymApiError } from './client.js'
import type { Config } from './config.js'
import { TOOLS, runTool } from './tools.js'

export function createServer(config: Config, fetchImpl?: typeof fetch): McpServer {
  const client = new GymApiClient(config, fetchImpl)

  const server = new McpServer({
    name: 'gym-assistant',
    version: '0.1.0',
  })

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (args: Record<string, unknown>) => {
        try {
          const text = await runTool(client, tool, args ?? {})
          return { content: [{ type: 'text' as const, text }] }
        } catch (err) {
          const message =
            err instanceof GymApiError
              ? `API error ${err.status}${err.code ? ` (${err.code})` : ''}: ${err.message}`
              : err instanceof Error
                ? err.message
                : String(err)
          return {
            content: [{ type: 'text' as const, text: message }],
            isError: true,
          }
        }
      },
    )
  }

  return server
}
