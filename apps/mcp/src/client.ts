/**
 * Thin, read-only HTTP client for the Gym Assistant API.
 *
 * Responsibilities:
 *   - Acquire a JWT access token (a static token, or a username/password login)
 *     lazily on first use, and rotate it internally for the process lifetime.
 *   - Attach `Authorization: Bearer <token>` to every request.
 *   - Transparently recover from a 401 once per call by refreshing (or
 *     re-logging-in), then retrying.
 *
 * Token acquisition is **single-flight**: concurrent callers that hit a 401
 * share one in-flight refresh/login, so the server never presents the same
 * (single-use) refresh token twice. Presenting a rotated refresh token to the
 * API triggers reuse-detection and revokes every session the user has, so this
 * guarantee matters — see apps/api AuthService.Refresh.
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

  constructor(status: number, message: string, code?: string, details?: unknown, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
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
  /** A rotated refresh token, only ever obtained from a login/refresh in this
   *  process — never seeded from the environment (those are single-use). */
  private refreshToken?: string
  /** The single in-flight token acquisition, shared by concurrent callers. */
  private pending?: Promise<void>

  constructor(config: Config, fetchImpl: FetchLike = fetch) {
    this.config = config
    this.fetchImpl = fetchImpl
    this.accessToken = config.token
  }

  /**
   * GET a path under /api/v1, returning the parsed JSON body.
   * `path` segments must already be encoded by the caller (see tools.ts).
   * `query` entries with undefined/null/'' values are dropped.
   */
  async get<T = unknown>(path: string, query?: Record<string, unknown>): Promise<T> {
    await this.ensureAccessToken()

    const url = this.buildUrl(path, query)

    let res = await this.sendGet(url)
    if (res.status === 401) {
      // Token may be expired/invalid — reacquire once (single-flight) and retry.
      await this.reacquire(this.accessToken)
      res = await this.sendGet(url)
    }

    return this.parseResponse<T>(res)
  }

  private async sendGet(url: string): Promise<Response> {
    return this.doFetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
      },
    })
  }

  /** fetch wrapper that enforces a per-request timeout and normalizes
   *  network/timeout failures into a GymApiError. */
  private async doFetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      })
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'TimeoutError'
      throw new GymApiError(
        0,
        isTimeout
          ? `Request to the Gym Assistant API timed out after ${this.config.timeoutMs}ms.`
          : `Network error contacting the Gym Assistant API: ${err instanceof Error ? err.message : String(err)}`,
        isTimeout ? 'timeout' : 'network_error',
        undefined,
        err,
      )
    }
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

  /** Ensure we hold an access token for the first request, acquiring one if
   *  needed (single-flight). */
  private async ensureAccessToken(): Promise<void> {
    if (this.accessToken) return
    await this.acquire()
  }

  /** Reacquire after a 401 on `staleToken`. If a concurrent caller already
   *  rotated the token, reuse theirs instead of refreshing again. */
  private async reacquire(staleToken?: string): Promise<void> {
    if (this.accessToken && this.accessToken !== staleToken) return
    await this.acquire()
  }

  /** Single-flight wrapper: at most one login/refresh runs at a time; all
   *  concurrent callers await the same promise. */
  private acquire(): Promise<void> {
    if (!this.pending) {
      this.pending = this.doAcquire().finally(() => {
        this.pending = undefined
      })
    }
    return this.pending
  }

  private async doAcquire(): Promise<void> {
    // Prefer rotating an in-memory refresh token; fall back to a fresh login.
    if (this.refreshToken) {
      try {
        await this.refresh()
        return
      } catch (err) {
        // The presented refresh token is now spent/invalid — never replay it.
        this.refreshToken = undefined
        if (!(this.config.identifier && this.config.password)) {
          throw new GymApiError(
            401,
            'Session refresh failed and no identifier/password is configured to re-authenticate.',
            'unauthorized',
            undefined,
            err,
          )
        }
      }
    }

    if (this.config.identifier && this.config.password) {
      await this.login()
      return
    }

    // Static-token-only mode: the token was rejected and there is nothing to
    // fall back to.
    throw new GymApiError(
      401,
      'The configured GYM_API_TOKEN was rejected or has expired; set GYM_API_IDENTIFIER and GYM_API_PASSWORD to auto-renew.',
      'unauthorized',
    )
  }

  private async login(): Promise<void> {
    const auth = await this.postAuth('auth/login', {
      identifier: this.config.identifier,
      password: this.config.password,
    })
    this.accessToken = auth.token
    this.refreshToken = auth.refresh_token
  }

  private async refresh(): Promise<void> {
    const auth = await this.postAuth('auth/refresh', {
      refresh_token: this.refreshToken,
    })
    this.accessToken = auth.token
    this.refreshToken = auth.refresh_token
  }

  private async postAuth(path: string, payload: Record<string, unknown>): Promise<AuthResponse> {
    const res = await this.doFetch(`${this.config.baseUrl}/api/v1/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
    return this.parseResponse<AuthResponse>(res)
  }
}
