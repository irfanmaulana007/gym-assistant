/** Jest runner config used by Detox (apps/mobile/.detoxrc.js). */
module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/../../tests/e2e/mobile/**/*.e2e.{ts,tsx}'],
  testTimeout: 180000,
  maxWorkers: 1,
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  reporters: ['detox/runners/jest/reporter'],
  testEnvironment: 'detox/runners/jest/testEnvironment',
  verbose: true,
  transform: { '\\.[jt]sx?$': 'babel-jest' },
}
