// A thin typed fetch wrapper. It injects the JWT bearer token, parses the API's
// JSON responses, and surfaces the standard error envelope as an ApiError.
// A single 401 handler (set by the auth layer) centralizes "logged out".

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080'

const TOKEN_KEY = 'gym.token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

let onUnauthorized: (() => void) | null = null

/** Register a callback invoked whenever the API returns 401. */
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn
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

  if (res.status === 401) {
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
