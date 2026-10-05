# Fastlane — iOS build & release

Lanes (`bundle exec fastlane <lane>`):

| Lane | What it does |
|------|--------------|
| `bootstrap` | `npm install` + `pod install` |
| `build_sim` | Debug simulator build (Detox e2e / CI smoke) |
| `test` | Vitest logic suite + RNTL component suite |
| `beta` | Build Release + upload to **TestFlight** |
| `release` | Build Release + submit to the **App Store** |

**Prerequisites** (macOS + Xcode):
1. Generate the native project — see `../README.md` ("Generating the iOS project").
2. `bundle install` (Ruby gems: CocoaPods + Fastlane).
3. Decide the **bundle id / Apple account** (PRD 0018 §6 Q4) and fill `Appfile`.
4. Signing via `match` — set `MATCH_GIT_URL` + an App Store Connect API key in CI.

These lanes are the build/release ownership the PRD accepts for going **bare RN**
(no Expo EAS). They are not exercised by the JS unit suite.
