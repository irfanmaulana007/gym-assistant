// Keychain-backed TokenStore (PRD 0018 §4.4 — the one deliberate platform change
// from web's localStorage). Credentials live in the iOS Keychain; they are
// hydrated into memory once at launch so the client's token reads stay
// synchronous and its refresh logic is identical to web. Writes persist back to
// the Keychain asynchronously (best-effort).

import * as Keychain from 'react-native-keychain'
import type { TokenStore } from '@/api/client'

const SERVICE = 'com.gymassistant.auth'

let token: string | null = null
let refresh: string | null = null

/** Load persisted credentials into memory. Call once before the app renders. */
export async function hydrateTokenStore(): Promise<void> {
  try {
    const creds = await Keychain.getGenericPassword({ service: SERVICE })
    if (creds) {
      const parsed = JSON.parse(creds.password) as { token: string | null; refresh: string | null }
      token = parsed.token ?? null
      refresh = parsed.refresh ?? null
    }
  } catch {
    // No stored credentials / Keychain unavailable — start logged out.
  }
}

function persist(): void {
  if (token && refresh) {
    void Keychain.setGenericPassword('gym', JSON.stringify({ token, refresh }), {
      service: SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }).catch(() => {})
  } else {
    void Keychain.resetGenericPassword({ service: SERVICE }).catch(() => {})
  }
}

export const keychainTokenStore: TokenStore = {
  getToken: () => token,
  setToken: (t) => {
    token = t
    persist()
  },
  getRefreshToken: () => refresh,
  setRefreshToken: (t) => {
    refresh = t
    persist()
  },
}
