// Jest config for the React Native COMPONENT tests (RNTL) — `npm run test:native`.
// These need the react-native preset + a device-like runtime and run on a
// macOS + Xcode build machine / CI, separate from the fast Vitest logic suite
// (`npm test`). Component test files are named `*.native.test.tsx` and live
// under the repo-root tests/ tree (per .claude/rules/testing.md).
module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@react-navigation|react-native-.*|@op-engineering|@testing-library)/)',
  ],
  testMatch: ['<rootDir>/../../tests/unit-test/mobile/**/*.native.test.tsx'],
}
