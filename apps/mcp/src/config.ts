/**
 * Configuration for the Gym Assistant MCP server, read entirely from the
 * environment (no hardcoded secrets — per .claude/rules).
 *
 * Auth is resolved in this order:
 *   1. GYM_API_TOKEN            — a pre-obtained JWT access token (used as-is).
 *   2. GYM_API_REFRESH_TOKEN    — an opaque refresh token (exchanged for an
 *                                 access token, then auto-rotated).
 *   3. GYM_API_IDENTIFIER (or GYM_API_EMAIL) + GYM_API_PASSWORD — a login flow.
 *
 * The server is strictly read-only: it only ever issues GET requests against
 * the API, regardless of which credential is supplied.
 */

export interface Config {
  baseUrl: string
  token?: string
  refreshToken?: string
  identifier?: string
  password?: string
}

const DEFAULT_BASE_URL = 'https://api-gym.irfanmaulana007.com'

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const baseUrl = (clean(env.GYM_API_BASE_URL) ?? DEFAULT_BASE_URL).replace(/\/+$/, '')

  const config: Config = {
    baseUrl,
    token: clean(env.GYM_API_TOKEN),
    refreshToken: clean(env.GYM_API_REFRESH_TOKEN),
    identifier: clean(env.GYM_API_IDENTIFIER) ?? clean(env.GYM_API_EMAIL),
    password: clean(env.GYM_API_PASSWORD),
  }

  const hasCredential =
    config.token ||
    config.refreshToken ||
    (config.identifier && config.password)

  if (!hasCredential) {
    throw new Error(
      'No credentials configured. Set GYM_API_TOKEN, or GYM_API_REFRESH_TOKEN, ' +
        'or GYM_API_IDENTIFIER (/GYM_API_EMAIL) together with GYM_API_PASSWORD.',
    )
  }

  return config
}
