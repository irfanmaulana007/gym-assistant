import React, { useEffect, useState } from 'react'
import { StatusBar, View } from 'react-native'
import { NavigationContainer, DefaultTheme, type Theme } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClientProvider } from '@tanstack/react-query'
import { color } from '@/theme'
import { queryClient } from '@/lib/queryClient'
import { SyncProvider } from '@/lib/sync'
import { AuthProvider } from '@/lib/auth'
import { setTokenStore } from '@/api/client'
import { keychainTokenStore, hydrateTokenStore } from '@/lib/tokenStore'
import { Spinner } from '@/components/ui'
import { RootNavigator } from '@/navigation/RootNavigator'

// Install the Keychain-backed token store before any request is made.
setTokenStore(keychainTokenStore)

const navTheme: Theme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: color.primary,
    background: color.bg,
    card: color.bg,
    text: color.text,
    border: color.border,
    notification: color.danger,
  },
}

// Provider stack mirrors web App.tsx (QueryClient → Auth → Router), with a
// SyncProvider wrapping auth so login can kick an initial pull. Credentials are
// hydrated from the Keychain into memory before the first render so a returning
// user opens straight to their data (and offline).
export function App() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    hydrateTokenStore().finally(() => setReady(true))
  }, [])

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={color.bg} />
      {!ready ? (
        <View style={{ flex: 1, backgroundColor: color.bg, justifyContent: 'center' }}>
          <Spinner label="Starting…" />
        </View>
      ) : (
        <QueryClientProvider client={queryClient}>
          <SyncProvider>
            <AuthProvider>
              <NavigationContainer theme={navTheme}>
                <RootNavigator />
              </NavigationContainer>
            </AuthProvider>
          </SyncProvider>
        </QueryClientProvider>
      )}
    </SafeAreaProvider>
  )
}
