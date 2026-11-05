/**
 * OAuth 2.1 authorization server for the remote MCP endpoint (PRD 0023).
 *
 * The user signs in with their own Gym Assistant account on a page this
 * server renders; the resulting API access/refresh tokens are sealed inside
 * opaque OAuth tokens (see seal.ts) so nothing is stored and Claude never
 * sees a raw API JWT. Each MCP request then runs against the API as exactly
 * the user who authorized it.
 */

import { randomUUID } from 'node:crypto'
import type { Response } from 'express'
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js'
import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidTargetError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js'
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { GymApiError } from '../client.js'
import { ApiAuth, jwtExpiry, type ApiTokens } from './apiAuth.js'
import { renderLoginPage } from './loginPage.js'
import { Sealer } from './seal.js'

export const LOGIN_STATE_TTL_SECONDS = 10 * 60
export const CODE_TTL_SECONDS = 5 * 60
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60
/** Used only if the API JWT carries no readable `exp`. */
const FALLBACK_ACCESS_TTL_SECONDS = 15 * 60
/** Grace window after a refresh token is first redeemed, during which a replay
 *  (a retried or concurrent request) is served the already-rotated pair instead
 *  of re-forwarding the spent API refresh token — see `exchangeRefreshToken`. */
const REFRESH_GRACE_SECONDS = 60
/** Prune the refresh bookkeeping maps once per this many refresh exchanges. */
const REFRESH_PRUNE_EVERY = 64

/** Scopes this server understands and can grant. Anything else a client asks
 *  for is dropped rather than echoed back as if granted. */
export const SUPPORTED_SCOPES = ['read']

/** Client metadata kept inside the sealed client_id (kept small on purpose). */
interface ClientPayload {
  redirect_uris: string[]
  token_endpoint_auth_method?: string
  grant_types?: string[]
  response_types?: string[]
  client_name?: string
  scope?: string
  iat: number
}

interface LoginState {
  c: string // client_id
  r: string // redirect_uri
  ch: string // PKCE challenge
  s?: string // client state
  sc: string[] // scopes
  rs: string // resource
}

interface CodePayload {
  c: string
  r: string
  ch: string
  sc: string[]
  rs: string
  at: string // API access token
  rt: string // API refresh token
  j: string // jti, single-use
}

interface AccessPayload {
  c: string
  sc: string[]
  rs: string
  at: string
}

interface RefreshPayload {
  c: string
  sc: string[]
  rs: string
  rt: string
  j: string // jti — single-use with a short grace window (see exchangeRefreshToken)
}

export type LoginResult =
  | { kind: 'redirect'; location: string }
  | { kind: 'page'; status: number; html: string; redirectUri?: string }

export interface GymOAuthProviderOptions {
  sealer: Sealer
  apiAuth: ApiAuth
  /** Canonical URL of the MCP endpoint, e.g. https://mcp.example.com/mcp */
  resourceUrl: URL
  /** Optional allowlist of exact redirect URIs a client may register (DCR). When
   *  empty, any redirect URI is accepted (and the consent page shows its host so
   *  the user can spot a phishing client). */
  allowedRedirectUris?: string[]
}

function sameResource(a: string, b: string): boolean {
  const norm = (v: string) => v.split('#')[0].replace(/\/$/, '')
  return norm(a) === norm(b)
}

export class GymOAuthProvider implements OAuthServerProvider {
  private readonly sealer: Sealer
  private readonly apiAuth: ApiAuth
  private readonly resource: string
  /** Exact redirect URIs a client may register, or empty for no restriction. */
  private readonly allowedRedirectUris: Set<string>
  /** jti → expiry, so a (stateless) code can only be redeemed once. */
  private readonly usedCodes = new Map<string, number>()
  /** Refresh-token jti → expiry of the "already redeemed" record. Once a refresh
   *  token has been forwarded to the API, its jti is remembered so a later replay
   *  is rejected locally rather than re-forwarded (re-forwarding a spent API
   *  token trips the API's reuse detection and logs the user out everywhere). */
  private readonly usedRefresh = new Map<string, number>()
  /** Refresh-token jti → the rotated pair, cached for a short grace window so a
   *  retried or concurrent refresh gets the same new tokens without a second API
   *  call. */
  private readonly refreshResults = new Map<string, { exp: number; tokens: OAuthTokens }>()
  /** Refresh-token jti → in-flight refresh, so concurrent uses of one token share
   *  a single API call instead of each forwarding the same (single-use) token. */
  private readonly refreshInFlight = new Map<string, Promise<OAuthTokens>>()
  /** Counts refresh exchanges to amortise the bookkeeping-map prune. */
  private refreshOps = 0

  readonly clientsStore: OAuthRegisteredClientsStore

  constructor(opts: GymOAuthProviderOptions) {
    this.sealer = opts.sealer
    this.apiAuth = opts.apiAuth
    this.resource = opts.resourceUrl.href
    this.allowedRedirectUris = new Set(opts.allowedRedirectUris ?? [])

    this.clientsStore = {
      getClient: (clientId) => this.getClient(clientId),
      registerClient: (client) => this.registerClient(client),
    }
  }

  // ---- Clients (stateless DCR) -------------------------------------------

  private registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>,
  ): OAuthClientInformationFull {
    const redirectUris = client.redirect_uris.map(String)
    if (!this.redirectUrisAllowed(redirectUris)) {
      const rejected = redirectUris.find((uri) => !this.allowedRedirectUris.has(uri))
      throw new InvalidClientMetadataError(`redirect_uri is not allowed: ${rejected}`)
    }
    const iat = this.sealer.nowSeconds()
    const payload: ClientPayload = {
      redirect_uris: redirectUris,
      token_endpoint_auth_method: client.token_endpoint_auth_method,
      grant_types: client.grant_types,
      response_types: client.response_types,
      client_name: client.client_name,
      scope: client.scope,
      iat,
    }
    const clientId = this.sealer.seal('client', payload, 0)
    return this.toClientInfo(clientId, payload)
  }

  private getClient(clientId: string): OAuthClientInformationFull | undefined {
    const opened = this.sealer.open<ClientPayload>('client', clientId)
    if (!opened) return undefined
    // Enforce the allowlist on every open, not just at registration: client ids
    // are stateless sealed blobs that never expire, so a client registered
    // before the allowlist was enabled would otherwise still drive /authorize.
    if (!this.redirectUrisAllowed(opened.data.redirect_uris)) return undefined
    return this.toClientInfo(clientId, opened.data)
  }

  /** Whether every redirect URI is permitted (always true when no allowlist). */
  private redirectUrisAllowed(uris: string[]): boolean {
    if (this.allowedRedirectUris.size === 0) return true
    return uris.every((uri) => this.allowedRedirectUris.has(uri))
  }

  private toClientInfo(clientId: string, p: ClientPayload): OAuthClientInformationFull {
    const isPublic = p.token_endpoint_auth_method === 'none'
    return {
      client_id: clientId,
      client_id_issued_at: p.iat,
      redirect_uris: p.redirect_uris,
      ...(p.token_endpoint_auth_method ? { token_endpoint_auth_method: p.token_endpoint_auth_method } : {}),
      ...(p.grant_types ? { grant_types: p.grant_types } : {}),
      ...(p.response_types ? { response_types: p.response_types } : {}),
      ...(p.client_name ? { client_name: p.client_name } : {}),
      ...(p.scope ? { scope: p.scope } : {}),
      ...(isPublic
        ? {}
        : { client_secret: this.sealer.clientSecretFor(clientId), client_secret_expires_at: 0 }),
    }
  }

  // ---- Authorization ------------------------------------------------------

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    // Tokens are only ever minted for this MCP endpoint.
    if (params.resource && !sameResource(params.resource.href, this.resource)) {
      throw new InvalidTargetError('This server only issues tokens for its own MCP endpoint.')
    }
    const state: LoginState = {
      c: client.client_id,
      r: params.redirectUri,
      ch: params.codeChallenge,
      s: params.state,
      // Only grant scopes we actually understand; silently dropping the rest
      // keeps the issued tokens from claiming access that was never granted.
      sc: (params.scopes ?? []).filter((s) => SUPPORTED_SCOPES.includes(s)),
      rs: this.resource,
    }
    const loginToken = this.sealer.seal('login', state, LOGIN_STATE_TTL_SECONDS)
    sendLoginPage(
      res,
      200,
      renderLoginPage({ loginToken, clientName: client.client_name, redirectUri: params.redirectUri }),
      params.redirectUri,
    )
  }

  /** Handle the login form POST: sign in at the API, then redirect back to
   *  the client with a one-time authorization code. */
  async completeLogin(loginToken: string, identifier: string, password: string): Promise<LoginResult> {
    const opened = this.sealer.open<LoginState>('login', loginToken)
    if (!opened) {
      return {
        kind: 'page',
        status: 400,
        html: renderErrorPage('This sign-in link has expired. Go back to Claude and connect again.'),
      }
    }
    const state = opened.data
    const client = this.getClient(state.c)
    // Re-check the redirect target against the (sealed) client registration.
    if (!client || !client.redirect_uris.map(String).includes(state.r)) {
      return { kind: 'page', status: 400, html: renderErrorPage('Unknown client. Connect again from Claude.') }
    }

    const retry = (status: number, error: string): LoginResult => ({
      kind: 'page',
      status,
      html: renderLoginPage({
        loginToken,
        clientName: client.client_name,
        redirectUri: state.r,
        identifier,
        error,
      }),
      redirectUri: state.r,
    })

    if (!identifier.trim() || !password) return retry(400, 'Enter your email/username and password.')

    let tokens: ApiTokens
    try {
      tokens = await this.apiAuth.login(identifier.trim(), password)
    } catch (err) {
      if (err instanceof GymApiError && (err.status === 400 || err.status === 401)) {
        return retry(401, 'Incorrect email/username or password.')
      }
      if (err instanceof GymApiError && err.status === 429) {
        return retry(429, 'Too many attempts. Wait a moment and try again.')
      }
      return retry(502, 'Could not reach Gym Assistant. Please try again.')
    }

    const code: CodePayload = {
      c: state.c,
      r: state.r,
      ch: state.ch,
      sc: state.sc,
      rs: state.rs,
      at: tokens.token,
      rt: tokens.refresh_token,
      j: randomUUID(),
    }
    const location = new URL(state.r)
    location.searchParams.set('code', this.sealer.seal('code', code, CODE_TTL_SECONDS))
    if (state.s !== undefined) location.searchParams.set('state', state.s)
    return { kind: 'redirect', location: location.href }
  }

  private openCode(client: OAuthClientInformationFull, authorizationCode: string): CodePayload {
    const opened = this.sealer.open<CodePayload>('code', authorizationCode)
    if (!opened || opened.data.c !== client.client_id) {
      throw new InvalidGrantError('Invalid or expired authorization code')
    }
    return opened.data
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    return this.openCode(client, authorizationCode).ch
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const code = this.openCode(client, authorizationCode)
    if (redirectUri !== undefined && redirectUri !== code.r) {
      throw new InvalidGrantError('redirect_uri does not match the authorization request')
    }
    if (resource && !sameResource(resource.href, code.rs)) {
      throw new InvalidTargetError('resource does not match the authorization request')
    }
    this.consumeCode(code.j)
    return this.issueTokens(code.c, code.sc, code.rs, { token: code.at, refresh_token: code.rt })
  }

  private consumeCode(jti: string): void {
    const now = this.sealer.nowSeconds()
    for (const [id, exp] of this.usedCodes) if (exp <= now) this.usedCodes.delete(id)
    if (this.usedCodes.has(jti)) throw new InvalidGrantError('Authorization code has already been used')
    this.usedCodes.set(jti, now + CODE_TTL_SECONDS)
  }

  // ---- Tokens ---------------------------------------------------------------

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    const opened = this.sealer.open<RefreshPayload>('refresh', refreshToken)
    if (!opened || opened.data.c !== client.client_id) {
      throw new InvalidGrantError('Invalid or expired refresh token')
    }
    const rt = opened.data
    if (resource && !sameResource(resource.href, rt.rs)) {
      throw new InvalidTargetError('resource does not match the original grant')
    }

    // The API single-uses refresh tokens and, on reuse of a rotated one, revokes
    // *every* session the user has (web app included). Since our sealed refresh
    // token is a stateless blob that can be presented again and again (retry,
    // double refresh, a stale copy in a client cache), we must forward the
    // embedded API token to `/auth/refresh` at most once per jti.
    this.maybePruneRefresh()
    const now = this.sealer.nowSeconds()
    const cached = this.refreshResults.get(rt.j)
    if (cached && cached.exp > now) return cached.tokens // retry within grace → same rotated pair
    const inFlight = this.refreshInFlight.get(rt.j)
    if (inFlight) return inFlight // concurrent refresh → share the one API call
    if (this.usedRefresh.has(rt.j)) {
      // Already redeemed once and past the grace window — reject locally instead
      // of re-forwarding the now-spent API token (which would trip revoke-all).
      throw new InvalidGrantError('Refresh token already used; sign in again')
    }

    const promise = this.rotateApiTokens(rt)
    this.refreshInFlight.set(rt.j, promise)
    try {
      const tokens = await promise
      this.usedRefresh.set(rt.j, opened.expiresAt)
      this.refreshResults.set(rt.j, { exp: this.sealer.nowSeconds() + REFRESH_GRACE_SECONDS, tokens })
      return tokens
    } catch (err) {
      // The API may have rotated the token before this error reached us (an
      // ambiguous timeout / 5xx, or even a definite 4xx on an already-revoked
      // token). Either way, record the jti as used so a client retry is rejected
      // locally rather than re-forwarding the token and tripping revoke-all —
      // forcing a reconnect is strictly better than logging the user out.
      this.usedRefresh.set(rt.j, opened.expiresAt)
      throw err
    } finally {
      this.refreshInFlight.delete(rt.j)
    }
  }

  private async rotateApiTokens(rt: RefreshPayload): Promise<OAuthTokens> {
    let tokens: ApiTokens
    try {
      tokens = await this.apiAuth.refresh(rt.rt)
    } catch (err) {
      if (err instanceof GymApiError && err.status > 0 && err.status < 500) {
        // The API refresh token is spent/revoked — the user must reconnect.
        throw new InvalidGrantError('Refresh token is no longer valid; sign in again')
      }
      throw err
    }
    return this.issueTokens(rt.c, rt.sc, rt.rs, tokens)
  }

  /** Drop expired entries from the refresh bookkeeping maps, but only every
   *  Nth call — each entry self-expires (its key can no longer be opened once
   *  the sealed token itself expires), so the scan is just memory hygiene and
   *  need not run on the hot path of every refresh. */
  private maybePruneRefresh(): void {
    if (this.refreshOps++ % REFRESH_PRUNE_EVERY !== 0) return
    const now = this.sealer.nowSeconds()
    for (const [id, exp] of this.usedRefresh) if (exp <= now) this.usedRefresh.delete(id)
    for (const [id, { exp }] of this.refreshResults) if (exp <= now) this.refreshResults.delete(id)
  }

  private issueTokens(clientId: string, scopes: string[], resource: string, api: ApiTokens): OAuthTokens {
    const now = this.sealer.nowSeconds()
    const accessExp = jwtExpiry(api.token) ?? now + FALLBACK_ACCESS_TTL_SECONDS
    const access: AccessPayload = { c: clientId, sc: scopes, rs: resource, at: api.token }
    const refresh: RefreshPayload = { c: clientId, sc: scopes, rs: resource, rt: api.refresh_token, j: randomUUID() }
    return {
      access_token: this.sealer.sealUntil('access', access, accessExp),
      token_type: 'bearer',
      expires_in: Math.max(accessExp - now, 0),
      refresh_token: this.sealer.seal('refresh', refresh, REFRESH_TTL_SECONDS),
      ...(scopes.length ? { scope: scopes.join(' ') } : {}),
    }
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const opened = this.sealer.open<AccessPayload>('access', token)
    if (!opened) throw new InvalidTokenError('Invalid or expired access token')
    const a = opened.data
    return {
      token,
      clientId: a.c,
      scopes: a.sc,
      expiresAt: opened.expiresAt,
      resource: new URL(a.rs),
      extra: { apiToken: a.at },
    }
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    // Access tokens are stateless and short-lived; revoking the refresh token
    // revokes the underlying API session, which is what matters.
    const opened = this.sealer.open<RefreshPayload>('refresh', request.token)
    if (!opened || opened.data.c !== client.client_id) return
    try {
      await this.apiAuth.logout(opened.data.rt)
    } catch {
      // Revocation is best-effort and must not error for unknown tokens.
    }
  }
}

/** CSP source for a redirect URI. Browsers enforce `form-action` on the
 *  redirect that follows the form POST, so the client's callback must be
 *  allowed alongside 'self'. */
function formActionSource(redirectUri: string): string | undefined {
  try {
    const u = new URL(redirectUri)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : u.protocol
  } catch {
    return undefined
  }
}

/** Send an HTML page with headers that keep the login form from being
 *  framed, cached, or running any script. */
export function sendLoginPage(res: Response, status: number, html: string, redirectUri?: string): void {
  const extra = redirectUri ? formActionSource(redirectUri) : undefined
  res
    .status(status)
    .set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'${extra ? ` ${extra}` : ''}; frame-ancestors 'none'; base-uri 'none'`,
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    })
    .send(html)
}

function renderErrorPage(message: string): string {
  return renderLoginPage({ loginToken: '', error: message }).replace(
    /<form[\s\S]*<\/form>/,
    '',
  )
}
