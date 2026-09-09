/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Vite + Vitest config. Unit tests live in the repo-root tests/unit-test/web
// tree (per .claude/rules/testing.md) and import app code via the '@' alias.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Allow serving the repo-root tests/ tree (unit tests live outside apps/web
    // per .claude/rules/testing.md).
    fs: { allow: ['..', '../..'] },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // A concrete origin so jsdom exposes localStorage (opaque origins don't).
    environmentOptions: { jsdom: { url: 'http://localhost:5173/' } },
    setupFiles: ['./vitest.setup.ts'],
    include: ['../../tests/unit-test/web/**/*.{test,spec}.{ts,tsx}'],
  },
})
