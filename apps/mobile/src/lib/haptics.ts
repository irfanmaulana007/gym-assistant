// Haptic tap feedback on primary actions (PRD 0018 §4.6). Wrapped so a missing
// native module never throws (e.g. simulator / unit context).

import ReactNativeHapticFeedback from 'react-native-haptic-feedback'

const options = { enableVibrateFallback: false, ignoreAndroidSystemSettings: false }

export function tapFeedback(kind: 'impactLight' | 'impactMedium' | 'notificationSuccess' = 'impactLight'): void {
  try {
    ReactNativeHapticFeedback.trigger(kind, options)
  } catch {
    // no-op
  }
}
