/**
 * Sentry initialization for the web app.
 *
 * The DSN comes from the build-time env var VITE_SENTRY_DSN (a Sentry DSN is a
 * public, non-secret identifier). When it is unset this is a safe no-op: the app
 * renders normally without Sentry. Keep this out of any module with side effects
 * so it can be unit-tested in isolation.
 */

import * as Sentry from '@sentry/react'

/** Default trace sampling for a low-traffic personal app. */
const DEFAULT_TRACES_SAMPLE_RATE = 0.2

let initialized = false

/**
 * Initialize Sentry from the given Vite env. Returns true when Sentry was
 * configured, false when it was a no-op (no DSN). Safe to call more than once.
 */
export function initSentry(env: ImportMetaEnv = import.meta.env): boolean {
  const dsn = env.VITE_SENTRY_DSN?.trim()
  if (!dsn) return false
  if (initialized) return true

  Sentry.init({
    dsn,
    environment: env.VITE_SENTRY_ENVIRONMENT?.trim() || env.MODE || 'development',
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: DEFAULT_TRACES_SAMPLE_RATE,
  })
  initialized = true
  return true
}
