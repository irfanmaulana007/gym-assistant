/**
 * Configuration for the Gym Assistant MCP server, read entirely from the
 * environment (no hardcoded secrets — per .claude/rules).
 *
 * Auth is resolved in this order:
 *   1. GYM_API_TOKEN                               — a pre-obtained JWT access
 *                                                    token (used as-is).
 *   2. GYM_API_IDENTIFIER (or GYM_API_EMAIL) +     — a username/password login;
 *      GYM_API_PASSWORD                              the server rotates tokens
 *                                                    internally for its lifetime.
 *
 * A raw refresh token is deliberately NOT accepted as a startup credential: the
 * API rotates and single-uses refresh tokens (presenting a rotated one triggers
 * reuse-detection and revokes every session the user has), so an env-provided
 * refresh token would be replayed on each launch and log the user out
 * everywhere. Login or a static access token avoid that entirely.
 *
 * The server is strictly read-only: it only ever issues GET requests against
 * the API, regardless of which credential is supplied.
 */

export interface Config {
  baseUrl: string
  token?: string
  identifier?: string
  password?: string
  /** Per-request timeout in milliseconds. */
  timeoutMs: number
}

const DEFAULT_BASE_URL = 'https://api-gym.irfanmaulana007.com'
const DEFAULT_TIMEOUT_MS = 15_000

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  )
}

function resolveBaseUrl(raw: string | undefined): string {
  const value = (clean(raw) ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`GYM_API_BASE_URL is not a valid URL: ${value}`)
  }
  // Refuse plaintext to a non-loopback host — credentials would travel in the
  // clear. Local dev over http://localhost is allowed.
  if (parsed.protocol !== 'https:' && !isLoopbackHost(parsed.hostname)) {
    throw new Error(
      `GYM_API_BASE_URL must use https for a non-local host (got ${parsed.protocol}//${parsed.hostname}).`,
    )
  }
  return value
}

function resolveTimeout(raw: string | undefined): number {
  const value = clean(raw)
  if (!value) return DEFAULT_TIMEOUT_MS
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`GYM_API_TIMEOUT_MS must be a positive number of milliseconds (got ${value}).`)
  }
  return n
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config: Config = {
    baseUrl: resolveBaseUrl(env.GYM_API_BASE_URL),
    token: clean(env.GYM_API_TOKEN),
    identifier: clean(env.GYM_API_IDENTIFIER) ?? clean(env.GYM_API_EMAIL),
    password: clean(env.GYM_API_PASSWORD),
    timeoutMs: resolveTimeout(env.GYM_API_TIMEOUT_MS),
  }

  const hasCredential = config.token || (config.identifier && config.password)

  if (!hasCredential) {
    throw new Error(
      'No credentials configured. Set GYM_API_TOKEN, or GYM_API_IDENTIFIER ' +
        '(/GYM_API_EMAIL) together with GYM_API_PASSWORD.',
    )
  }

  return config
}
