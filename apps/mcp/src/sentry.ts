/**
 * Shared Sentry initialization for the MCP server (stdio and HTTP entrypoints).
 *
 * Reading config from the environment keeps the DSN out of source (a Sentry DSN
 * is a public, non-secret identifier, but it still belongs in env/config). When
 * SENTRY_DSN is unset this is a safe no-op: the server runs normally without
 * Sentry.
 */

import * as Sentry from '@sentry/node'

/** Default trace sampling for a low-traffic personal service. */
const DEFAULT_TRACES_SAMPLE_RATE = 0.2

let initialized = false

/**
 * Initialize Sentry from the environment. Returns true when Sentry was
 * configured, false when it was a no-op (no DSN). Safe to call more than once —
 * subsequent calls after a successful init are ignored.
 */
export function initSentry(env: NodeJS.ProcessEnv = process.env): boolean {
  const dsn = env.SENTRY_DSN?.trim()
  if (!dsn) return false
  if (initialized) return true

  Sentry.init({
    dsn,
    environment: env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV?.trim() || 'development',
    tracesSampleRate: DEFAULT_TRACES_SAMPLE_RATE,
  })
  initialized = true
  return true
}
