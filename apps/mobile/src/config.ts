// Runtime configuration. In the RN app these are injected natively by
// react-native-config from a `.env` file (no hardcoded URL — per
// apps/api/CLAUDE.md / apps/web/CLAUDE.md; the web equivalent is
// VITE_API_BASE_URL). The guarded require keeps this module importable under
// plain Node (Vitest unit tests) where the native module is absent, falling
// back to the local dev defaults.

type RNConfig = Record<string, string | undefined>

function loadNativeConfig(): RNConfig {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-config')
    return (mod?.default ?? mod ?? {}) as RNConfig
  } catch {
    return {}
  }
}

const native = loadNativeConfig()

export const config = {
  /** Base URL of the gym-assistant API (`/api/v1` is appended per request). */
  apiBaseUrl: native.API_BASE_URL ?? 'http://localhost:8080',
  /** anatome muscle-diagram image service (PRD 0009 / 0011). */
  anatomeBaseUrl: native.ANATOME_BASE_URL ?? 'https://api.anatome.dev',
} as const
