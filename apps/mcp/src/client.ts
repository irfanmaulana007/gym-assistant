/**
 * Thin, read-only HTTP client for the Gym Assistant API.
 *
 * Responsibilities:
 *   - Acquire a JWT access token (static token, refresh-token exchange, or a
 *     username/password login) lazily on first use.
 *   - Attach `Authorization: Bearer <token>` to every request.
 *   - Transparently recover from a 401 once per call by refreshing or
 *     re-logging-in, then retrying.
 *
 * It deliberately exposes only `get()` — the server never mutates data.
 */

import type { Config } from './config.js'

interface AuthResponse {
  token: string
  refresh_token?: string
  user?: unknown
}

export class GymApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly details?: unknown

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message)
    this.name = 'GymApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

type FetchLike = typeof fetch

export class GymApiClient {
  private readonly config: Config
  private readonly fetchImpl: FetchLike
  private accessToken?: string
  private refreshToken?: string

  constructor(config: Config, fetchImpl: FetchLike = fetch) {
    this.config = config
    this.fetchImpl = fetchImpl
    this.accessToken = config.token
    this.refreshToken = config.refreshToken
  }

  /**
   * GET a path under /api/v1, returning the parsed JSON body.
   * `path` is relative to the API version root, e.g. "routines" or
   * "sessions/123". `query` entries with undefined/null values are dropped.
   */
  async get<T = unknown>(path: string, query?: Record<string, unknown>): Promise<T> {
    await this.ensureAccessToken()

    const url = this.buildUrl(path, query)

    let res = await this.sendGet(url)
    if (res.status === 401) {
      // Token may be expired/invalid — reacquire once and retry.
      this.accessToken = undefined
      await this.ensureAccessToken(true)
      res = await this.sendGet(url)
    }

    return this.parseResponse<T>(res)
  }

  private async sendGet(url: string): Promise<Response> {
    return this.fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
      },
    })
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const normalized = path.replace(/^\/+/, '')
    const url = new URL(`${this.config.baseUrl}/api/v1/${normalized}`)
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') continue
        url.searchParams.set(key, String(value))
      }
    }
    return url.toString()
  }

  private async parseResponse<T>(res: Response): Promise<T> {
    const text = await res.text()
    let body: unknown
    try {
      body = text ? JSON.parse(text) : undefined
    } catch {
      body = text
    }

    if (!res.ok) {
      const envelope = (body as { error?: { code?: string; message?: string; details?: unknown } })
        ?.error
      throw new GymApiError(
        res.status,
        envelope?.message ?? `Request failed with status ${res.status}`,
        envelope?.code,
        envelope?.details,
      )
    }

    return body as T
  }

  /** Ensure we hold an access token, acquiring one if needed. */
  private async ensureAccessToken(force = false): Promise<void> {
    if (this.accessToken && !force) return

    // Prefer refresh-token rotation when available; fall back to a fresh login.
    if (this.refreshToken) {
      try {
        await this.refresh()
        return
      } catch {
        // Refresh token may be revoked/expired — fall through to login.
        this.refreshToken = this.config.refreshToken && force ? undefined : this.refreshToken
      }
    }

    if (this.config.identifier && this.config.password) {
      await this.login()
      return
    }

    if (this.accessToken) return

    throw new GymApiError(
      401,
      'Unable to obtain an access token: refresh failed and no identifier/password configured.',
      'unauthorized',
    )
  }

  private async login(): Promise<void> {
    const auth = await this.postAuth('auth/login', {
      identifier: this.config.identifier,
      password: this.config.password,
    })
    this.accessToken = auth.token
    if (auth.refresh_token) this.refreshToken = auth.refresh_token
  }

  private async refresh(): Promise<void> {
    const auth = await this.postAuth('auth/refresh', {
      refresh_token: this.refreshToken,
    })
    this.accessToken = auth.token
    if (auth.refresh_token) this.refreshToken = auth.refresh_token
  }

  private async postAuth(path: string, payload: Record<string, unknown>): Promise<AuthResponse> {
    const res = await this.fetchImpl(`${this.config.baseUrl}/api/v1/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
    return this.parseResponse<AuthResponse>(res)
  }
}
