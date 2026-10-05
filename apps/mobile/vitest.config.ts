/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

// Unit-test config for the mobile app's RN-free core — the offline/sync engine,
// the API client's refresh logic, theme parity, and the pure helpers (the
// highest-risk logic per PRD 0018 §5). These modules import no 'react-native'
// native module, so they run under a plain Node environment with no simulator.
//
// Mirrors the web setup: tests live OUTSIDE the app under the repo-root tests/
// tree and resolve app code through the `@` alias. Component (RNTL) tests and
// Detox e2e need the RN toolchain and run via `npm run test:native` /
// `test:e2e` on a macOS + Xcode build machine.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    // Only the `.ts` logic tests run under Vitest. RN component tests are named
    // `*.native.test.tsx` and run under the react-native Jest preset
    // (`npm run test:native`), never Vitest.
    include: ['../../tests/unit-test/mobile/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
  },
})
