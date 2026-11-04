/**
 * The three auth calls the OAuth layer makes against the Gym Assistant API on
 * a user's behalf: login (from the login page), refresh (from the /token
 * refresh grant) and logout (from /revoke). These are the only non-GET calls
 * the MCP server ever makes, and none of them touch workout data.
 */

import { GymApiError } from '../client.js'

export interface ApiTokens {
  token: string
  refresh_token: string
}

export interface ApiAuthOptions {
  baseUrl: string
  timeoutMs: number
  fetchImpl?: typeof fetch
}

export class ApiAuth {
  private readonly opts: ApiAuthOptions
  private readonly fetchImpl: typeof fetch

  constructor(opts: ApiAuthOptions) {
    this.opts = opts
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  login(identifier: string, password: string): Promise<ApiTokens> {
    return this.post<ApiTokens>('auth/login', { identifier, password })
  }

  refresh(refreshToken: string): Promise<ApiTokens> {
    return this.post<ApiTokens>('auth/refresh', { refresh_token: refreshToken })
  }

  async logout(refreshToken: string): Promise<void> {
    await this.post('auth/logout', { refresh_token: refreshToken })
  }

  private async post<T>(path: string, payload: Record<string, unknown>): Promise<T> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.opts.baseUrl}/api/v1/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      })
    } catch (err) {
      throw new GymApiError(
        0,
        `Network error contacting the Gym Assistant API: ${err instanceof Error ? err.message : String(err)}`,
        'network_error',
        undefined,
        err,
      )
    }

    const text = await res.text()
    let body: unknown
    try {
      body = text ? JSON.parse(text) : undefined
    } catch {
      body = undefined
    }
    if (!res.ok) {
      const envelope = (body as { error?: { code?: string; message?: string } } | undefined)?.error
      throw new GymApiError(
        res.status,
        envelope?.message ?? `Request failed with status ${res.status}`,
        envelope?.code,
      )
    }
    return body as T
  }
}

/** Read a JWT's `exp` claim without verifying it (the API verifies on use). */
export function jwtExpiry(token: string): number | undefined {
  const parts = token.split('.')
  if (parts.length !== 3) return undefined
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { exp?: unknown }
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp : undefined
  } catch {
    return undefined
  }
}
