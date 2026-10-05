import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { CompositeScreenProps } from '@react-navigation/native'

// The web routes (App.tsx) mapped onto a native stack + bottom tab navigator
// (PRD 0018 §4.1 — same navigation model as web: tabs + pushed detail screens).

export type RootStackParamList = {
  Tabs: undefined
  RoutineDetail: { id: string }
  ActiveSession: { id: string }
  ExerciseHistory: { id: string }
  EditProfile: undefined
  ChangePassword: undefined
}

export type TabParamList = {
  Progress: undefined
  Workout: undefined
  History: undefined
  Profile: undefined
}

export type AuthStackParamList = {
  Login: undefined
  Register: undefined
}

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>

export type AuthScreenProps<T extends keyof AuthStackParamList> = NativeStackScreenProps<AuthStackParamList, T>
