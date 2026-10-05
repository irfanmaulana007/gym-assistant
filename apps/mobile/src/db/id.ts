// Client-generated ids. Offline creates can't wait for a server id, so the
// client generates the UUID at creation time and uses it as the entity's real
// id everywhere — local row, child references, and the create request — so a
// replayed create is idempotent on the server (PRD 0018 §4.5, "Id strategy").
//
// Uses the platform CSPRNG when available: node (Vitest) exposes
// globalThis.crypto.randomUUID; the RN app imports 'react-native-get-random-values'
// at launch (index.js) to back crypto.getRandomValues. Falls back to a
// Math.random v4 only if neither exists, so the module never throws.

function randomUuidV4(): string {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(16)
    cryptoObj.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant
    const hex: string[] = []
    for (let i = 0; i < 256; i++) hex.push((i + 0x100).toString(16).slice(1))
    const b = bytes
    return (
      hex[b[0]] + hex[b[1]] + hex[b[2]] + hex[b[3]] + '-' +
      hex[b[4]] + hex[b[5]] + '-' +
      hex[b[6]] + hex[b[7]] + '-' +
      hex[b[8]] + hex[b[9]] + '-' +
      hex[b[10]] + hex[b[11]] + hex[b[12]] + hex[b[13]] + hex[b[14]] + hex[b[15]]
    )
  }
  // Last-resort fallback — non-crypto randomness.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function newId(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID()
  return randomUuidV4()
}
