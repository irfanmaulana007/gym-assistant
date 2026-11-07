/**
 * Side-effecting instrumentation module. Import this FIRST — before any other
 * local module — in every entrypoint so Sentry's auto-instrumentation can hook
 * the runtime before the app's modules are loaded.
 *
 * It does nothing when SENTRY_DSN is unset (see ./sentry).
 */

import { initSentry } from './sentry.js'

initSentry()
