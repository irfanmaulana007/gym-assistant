import '@testing-library/jest-dom/vitest'

// jsdom does not expose localStorage under an opaque origin, so provide a small
// in-memory implementation for tests that use it (the auth token store).
if (typeof globalThis.localStorage === 'undefined') {
  class MemoryStorage {
    private store = new Map<string, string>()
    get length() {
      return this.store.size
    }
    clear() {
      this.store.clear()
    }
    getItem(key: string) {
      return this.store.has(key) ? this.store.get(key)! : null
    }
    setItem(key: string, value: string) {
      this.store.set(key, String(value))
    }
    removeItem(key: string) {
      this.store.delete(key)
    }
    key(index: number) {
      return Array.from(this.store.keys())[index] ?? null
    }
  }
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  if (typeof globalThis.window !== 'undefined') {
    Object.defineProperty(globalThis.window, 'localStorage', { value: storage, configurable: true })
  }
}
