#!/usr/bin/env node
/**
 * Entrypoint: start the Gym Assistant MCP server over stdio.
 * Configuration (API base URL + credentials) comes from the environment —
 * see config.ts.
 */

// Initialize Sentry before anything else (no-op when SENTRY_DSN is unset).
import './instrument.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadConfig } from './config.js'
import { createServer } from './server.js'

async function main(): Promise<void> {
  const config = loadConfig()
  const server = createServer(config)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Never write to stdout — it is the MCP transport. Diagnostics go to stderr.
  process.stderr.write(`gym-assistant MCP server ready (base: ${config.baseUrl})\n`)
}

main().catch((err) => {
  process.stderr.write(`Failed to start gym-assistant MCP server: ${String(err)}\n`)
  process.exit(1)
})
