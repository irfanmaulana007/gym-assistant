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

/** Parse a URL and refuse plaintext http to a non-loopback host — credentials
 *  or tokens would travel in the clear. Local dev over http://localhost is
 *  allowed. Returns the value without trailing slashes. */
function resolveSecureUrl(name: string, raw: string): string {
  const value = raw.replace(/\/+$/, '')
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${name} is not a valid URL: ${value}`)
  }
  if (parsed.protocol !== 'https:' && !isLoopbackHost(parsed.hostname)) {
    throw new Error(
      `${name} must use https for a non-local host (got ${parsed.protocol}//${parsed.hostname}).`,
    )
  }
  return value
}

function resolveBaseUrl(raw: string | undefined): string {
  return resolveSecureUrl('GYM_API_BASE_URL', clean(raw) ?? DEFAULT_BASE_URL)
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

/**
 * Configuration for the remote (Streamable HTTP + OAuth) mode — see PRD 0023.
 *
 * Unlike stdio mode there are no API credentials here: every request carries
 * the API token of the user who signed in through the OAuth login page.
 */
export interface HttpConfig {
  /** API base URL + timeout, shared with stdio mode. */
  baseUrl: string
  timeoutMs: number
  /** Public origin of this server (OAuth issuer), e.g. https://mcp-gym.example.com */
  publicUrl: string
  /** Secret the sealed OAuth artifacts are keyed from (>= 32 chars). */
  oauthSecret: string
  port: number
  /** Express `trust proxy` setting (hops). */
  trustProxy: number
}

const MIN_SECRET_LENGTH = 32
const DEFAULT_PORT = 3000

function resolveInt(name: string, raw: string | undefined, fallback: number, min: number): number {
  const value = clean(raw)
  if (!value) return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n < min) {
    throw new Error(`${name} must be an integer >= ${min} (got ${value}).`)
  }
  return n
}

export function loadHttpConfig(env: NodeJS.ProcessEnv = process.env): HttpConfig {
  const publicRaw = clean(env.MCP_PUBLIC_URL)
  if (!publicRaw) {
    throw new Error('MCP_PUBLIC_URL is required (the public https origin of this server).')
  }
  const publicUrl = resolveSecureUrl('MCP_PUBLIC_URL', publicRaw)
  const parsed = new URL(publicUrl)
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error('MCP_PUBLIC_URL must be an origin without a path (e.g. https://mcp.example.com).')
  }

  const oauthSecret = clean(env.MCP_OAUTH_SECRET)
  if (!oauthSecret || oauthSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `MCP_OAUTH_SECRET is required and must be at least ${MIN_SECRET_LENGTH} characters (try \`openssl rand -hex 32\`).`,
    )
  }

  return {
    baseUrl: resolveBaseUrl(env.GYM_API_BASE_URL),
    timeoutMs: resolveTimeout(env.GYM_API_TIMEOUT_MS),
    publicUrl: parsed.origin,
    oauthSecret,
    port: resolveInt('PORT', env.PORT, DEFAULT_PORT, 0),
    trustProxy: resolveInt('MCP_TRUST_PROXY', env.MCP_TRUST_PROXY, 1, 0),
  }
}
