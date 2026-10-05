const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')

/** Default Metro config for the bare RN app. */
module.exports = mergeConfig(getDefaultConfig(__dirname), {})
