// A thin typed fetch wrapper. It injects the JWT bearer token, parses the API's
// JSON responses, and surfaces the standard error envelope as an ApiError.
// A single 401 handler (set by the auth layer) centralizes "logged out".

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080'

const TOKEN_KEY = 'gym.token'
const REFRESH_TOKEN_KEY = 'gym.refreshToken'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setRefreshToken(token: string | null): void {
  if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token)
  else localStorage.removeItem(REFRESH_TOKEN_KEY)
}

let onUnauthorized: (() => void) | null = null

/**
 * Register a callback invoked when the API returns 401 AND a token refresh could
 * not recover the session. A recoverable 401 (refresh succeeds) never fires it.
 */
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn
}

// A single in-flight refresh is shared across concurrent 401s so a burst of
// expired-token requests triggers exactly one /auth/refresh call.
let refreshInFlight: Promise<boolean> | null = null

async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false
  try {
    const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return false
    const data = (await res.json()) as { token?: string; refresh_token?: string }
    if (!data.token || !data.refresh_token) return false
    setToken(data.token)
    setRefreshToken(data.refresh_token)
    return true
  } catch {
    return false
  }
}

/** Refresh the access token, deduplicating concurrent callers. */
function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

export interface ApiErrorBody {
  code: string
  message: string
  details?: Record<string, unknown>
}

export class ApiError extends Error {
  status: number
  code: string
  details?: Record<string, unknown>

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || 'request failed')
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
    this.details = body.details
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  /** Skip attaching the bearer token (for login/register). */
  anonymous?: boolean
  /** Internal: set once a request has already been retried after a refresh. */
  _retried?: boolean
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  if (!opts.anonymous) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })

  if (res.status === 401 && !opts.anonymous && !opts._retried) {
    // The access token is likely expired. Try to refresh once and replay the
    // request transparently, so an active session never surfaces the 401.
    if (await refreshSession()) {
      return request<T>(path, { ...opts, _retried: true })
    }
  }

  if (res.status === 401) {
    // Refresh unavailable or failed — the session is truly over.
    onUnauthorized?.()
  }

  if (res.status === 204) {
    return undefined as T
  }

  const text = await res.text()
  const data = text ? JSON.parse(text) : undefined

  if (!res.ok) {
    const body: ApiErrorBody = data?.error ?? { code: 'unknown', message: 'request failed' }
    throw new ApiError(res.status, body)
  }

  return data as T
}
