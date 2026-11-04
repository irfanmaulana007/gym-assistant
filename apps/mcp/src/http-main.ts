#!/usr/bin/env node
/**
 * Entrypoint: start the Gym Assistant MCP server in remote mode
 * (Streamable HTTP + OAuth, PRD 0023). Config from the environment — see
 * loadHttpConfig in config.ts.
 */

import { loadHttpConfig } from './config.js'
import { createHttpApp } from './http.js'

try {
  const config = loadHttpConfig()
  const app = createHttpApp(config)
  const server = app.listen(config.port, () => {
    process.stderr.write(
      `gym-assistant MCP (http) listening on :${config.port} — public ${config.publicUrl}/mcp, api ${config.baseUrl}\n`,
    )
  })
  const shutdown = () => server.close(() => process.exit(0))
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
} catch (err) {
  process.stderr.write(`Failed to start gym-assistant MCP (http): ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
}
