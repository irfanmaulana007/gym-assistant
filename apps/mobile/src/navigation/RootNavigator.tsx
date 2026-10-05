import React from 'react'
import { View } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { color } from '@/theme'
import { Spinner } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import type { AuthStackParamList, RootStackParamList } from './types'
import { TabNavigator } from './TabNavigator'
import { LoginScreen } from '@/features/auth/LoginScreen'
import { RegisterScreen } from '@/features/auth/RegisterScreen'
import { RoutineDetailScreen } from '@/features/routines/RoutineDetailScreen'
import { ActiveSessionScreen } from '@/features/sessions/ActiveSessionScreen'
import { ExerciseHistoryScreen } from '@/features/exercises/ExerciseHistoryScreen'
import { EditProfileScreen } from '@/features/profile/EditProfileScreen'
import { ChangePasswordScreen } from '@/features/profile/ChangePasswordScreen'

const Stack = createNativeStackNavigator<RootStackParamList>()
const AuthStack = createNativeStackNavigator<AuthStackParamList>()

// Native top-bar styling that matches the web NavBar: translucent dark bg, no
// shadow, green back chevron, centered 17pt title.
const headerOptions = {
  headerStyle: { backgroundColor: color.bg },
  headerShadowVisible: false,
  headerTintColor: color.primary,
  headerTitleAlign: 'center' as const,
  headerTitleStyle: { color: color.text, fontWeight: '600' as const, fontSize: 17 },
  headerBackTitleVisible: false,
  contentStyle: { backgroundColor: color.bg },
}

function Splash() {
  return (
    <View style={{ flex: 1, backgroundColor: color.bg, justifyContent: 'center' }}>
      <Spinner label="Loading your account…" />
    </View>
  )
}

export function RootNavigator() {
  const { user, loading } = useAuth()

  if (loading) return <Splash />

  if (!user) {
    return (
      <AuthStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="Register" component={RegisterScreen} />
      </AuthStack.Navigator>
    )
  }

  return (
    <Stack.Navigator screenOptions={headerOptions}>
      <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="RoutineDetail" component={RoutineDetailScreen} options={{ title: 'Routine' }} />
      <Stack.Screen name="ActiveSession" component={ActiveSessionScreen} options={{ title: 'Workout' }} />
      <Stack.Screen name="ExerciseHistory" component={ExerciseHistoryScreen} options={{ title: 'Exercise' }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit profile' }} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ title: 'Change password' }} />
    </Stack.Navigator>
  )
}
