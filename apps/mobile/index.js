// RN entry point. The get-random-values polyfill backs crypto.getRandomValues
// (used by db/id.ts for client-generated UUIDs) and must be imported first.
import 'react-native-get-random-values'
import { AppRegistry } from 'react-native'
import { App } from './src/App'
import { name as appName } from './app.json'

AppRegistry.registerComponent(appName, () => App)
