/**
 * Authenticated encryption for the stateless OAuth artifacts (PRD 0023).
 *
 * Every client id, login-form state, authorization code, access token and
 * refresh token this server issues is an AES-256-GCM sealed JSON payload,
 * keyed from MCP_OAUTH_SECRET via HKDF. Nothing is stored server-side, so a
 * restart/redeploy never breaks a connected client, and rotating the secret
 * invalidates everything at once.
 *
 * Each payload carries a `purpose` that is checked on open, so e.g. a refresh
 * token can never be presented as an access token or a client id.
 */

import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto'

export type SealPurpose = 'client' | 'login' | 'code' | 'access' | 'refresh'

interface Envelope<T> {
  p: SealPurpose
  /** Expiry, seconds since epoch; 0 = never. */
  e: number
  d: T
}

const VERSION = 'v1'
const IV_BYTES = 12
const TAG_BYTES = 16

export class Sealer {
  private readonly encKey: Buffer
  private readonly macKey: Buffer
  private readonly now: () => number

  constructor(secret: string, now: () => number = () => Math.floor(Date.now() / 1000)) {
    const ikm = Buffer.from(secret, 'utf8')
    this.encKey = Buffer.from(hkdfSync('sha256', ikm, 'gym-assistant-mcp', 'seal-aes-256-gcm', 32))
    this.macKey = Buffer.from(hkdfSync('sha256', ikm, 'gym-assistant-mcp', 'client-secret-hmac', 32))
    this.now = now
  }

  nowSeconds(): number {
    return this.now()
  }

  /** Seal `data` for `purpose`, valid for `ttlSeconds` (0 = no expiry). */
  seal<T>(purpose: SealPurpose, data: T, ttlSeconds: number): string {
    const env: Envelope<T> = { p: purpose, e: ttlSeconds > 0 ? this.now() + ttlSeconds : 0, d: data }
    return this.sealEnvelope(env)
  }

  /** Seal with an absolute expiry (seconds since epoch). */
  sealUntil<T>(purpose: SealPurpose, data: T, expiresAt: number): string {
    return this.sealEnvelope({ p: purpose, e: expiresAt, d: data })
  }

  private sealEnvelope<T>(env: Envelope<T>): string {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv)
    const body = Buffer.concat([cipher.update(JSON.stringify(env), 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return `${VERSION}.${Buffer.concat([iv, tag, body]).toString('base64url')}`
  }

  /**
   * Open a sealed value. Returns undefined when it is malformed, tampered
   * with, sealed for another purpose, or expired — callers never need to
   * distinguish these (all mean "not a valid token").
   */
  open<T>(purpose: SealPurpose, sealed: string): { data: T; expiresAt: number } | undefined {
    if (typeof sealed !== 'string' || !sealed.startsWith(`${VERSION}.`)) return undefined
    const raw = Buffer.from(sealed.slice(VERSION.length + 1), 'base64url')
    if (raw.length <= IV_BYTES + TAG_BYTES) return undefined
    try {
      const iv = raw.subarray(0, IV_BYTES)
      const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
      const body = raw.subarray(IV_BYTES + TAG_BYTES)
      const decipher = createDecipheriv('aes-256-gcm', this.encKey, iv)
      decipher.setAuthTag(tag)
      const plain = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
      const env = JSON.parse(plain) as Envelope<T>
      if (env.p !== purpose) return undefined
      if (env.e !== 0 && env.e <= this.now()) return undefined
      return { data: env.d, expiresAt: env.e }
    } catch {
      return undefined
    }
  }

  /** Deterministic secret for a confidential client: HMAC(client_id). */
  clientSecretFor(clientId: string): string {
    return createHmac('sha256', this.macKey).update(clientId).digest('base64url')
  }

}
