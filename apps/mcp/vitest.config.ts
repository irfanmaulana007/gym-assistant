/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

// Unit + e2e tests live in the repo-root tests/ tree (per .claude/rules/testing.md).
// This app's slice is tests/{unit-test,e2e}/mcp. They import app code via the '@'
// alias so test files don't carry brittle ../../../ relative paths.
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      '../../tests/unit-test/mcp/**/*.{test,spec}.ts',
      '../../tests/e2e/mcp/**/*.{test,spec}.ts',
    ],
    // The e2e test spawns the built server over stdio; give it room.
    testTimeout: 20000,
  },
})
