/** Detox config for the iOS e2e suite (PRD 0018 §5). The suite drives the built
 * app in an iOS simulator against a SELF-CONTAINED API stack on dedicated ports
 * — reuse tests/cmd/e2eserver with E2E_API_PORT=8091 / E2E_PG_PORT=5435 so it
 * never collides with the web e2e (8090/5434) or the local dev ports (per
 * .claude/rules/testing.md). The app binary must be built with
 * API_BASE_URL pointing at that test API (see tests/e2e/mobile/README.md).
 *
 * Requires macOS + Xcode (and `applesimutils`). Not run by the JS unit suite. */
module.exports = {
  testRunner: {
    args: { $0: 'jest', config: 'e2e/jest.config.js' },
    jest: { setupTimeout: 180000 },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/GymAssistant.app',
      build:
        "xcodebuild -workspace ios/GymAssistant.xcworkspace -scheme GymAssistant -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build",
    },
  },
  devices: {
    simulator: { type: 'ios.simulator', device: { type: 'iPhone 15' } },
  },
  configurations: {
    'ios.sim.debug': { device: 'simulator', app: 'ios.debug' },
  },
}
