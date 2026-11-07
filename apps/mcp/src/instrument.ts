/**
 * Side-effecting instrumentation module. Loaded two ways, both idempotent
 * (initSentry guards against double init):
 *
 *   1. In production, as a Node preloader: `node --import ./dist/instrument.js
 *      dist/http-main.js` (see the `start`/`start:http` scripts and the
 *      Dockerfile CMD). Preloading is REQUIRED for OpenTelemetry's ESM
 *      auto-instrumentation (import-in-the-middle) to hook http/express/undici
 *      spans in this "type": "module" package.
 *   2. As the first `import` in each entrypoint, so `npm run dev` / `dev:http`
 *      (tsx, no --import) still initialize Sentry for error capture. Tracing
 *      spans there may be incomplete without the preloader — that is fine for
 *      local dev.
 *
 * Does nothing when SENTRY_DSN is unset (see ./sentry).
 */

import { initSentry } from './sentry.js'

initSentry()
