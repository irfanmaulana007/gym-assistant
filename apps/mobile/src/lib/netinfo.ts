// Connectivity signal for the sync worker (PRD 0018 §4.5 — sync reacts to
// NetInfo + app-foreground + a periodic tick).

import NetInfo from '@react-native-community/netinfo'

let online = true

export function isOnline(): boolean {
  return online
}

/** Subscribe to connectivity changes; returns an unsubscribe fn. */
export function subscribeNetInfo(onChange: (online: boolean) => void): () => void {
  return NetInfo.addEventListener((state) => {
    const next = !!state.isConnected && state.isInternetReachable !== false
    const changed = next !== online
    online = next
    if (changed) onChange(online)
  })
}
