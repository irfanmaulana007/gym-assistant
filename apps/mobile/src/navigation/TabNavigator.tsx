import React from 'react'
import { View } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { color, layout } from '@/theme'
import { ChartIcon, ClockIcon, DumbbellIcon, UserIcon } from '@/components/icons'
import { Avatar } from '@/components/Avatar'
import { ResumeSessionBanner } from '@/components/ResumeSessionBanner'
import { useAuth } from '@/lib/auth'
import type { TabParamList } from './types'
import { DashboardScreen } from '@/features/progress/DashboardScreen'
import { WorkoutScreen } from '@/features/routines/WorkoutScreen'
import { SessionHistoryScreen } from '@/features/sessions/SessionHistoryScreen'
import { ProfileScreen } from '@/features/profile/ProfileScreen'

const Tab = createBottomTabNavigator<TabParamList>()

function ProfileTabIcon({ focused }: { focused: boolean }) {
  const { user } = useAuth()
  if (user?.avatar_url) {
    return (
      <View style={{ borderRadius: 999, borderWidth: focused ? 2 : 0, borderColor: color.primary }}>
        <Avatar name={user.display_name} src={user.avatar_url} />
      </View>
    )
  }
  return <UserIcon size={24} color={focused ? color.primary : color.textFaint} />
}

// Native bottom tab bar — the same four destinations as web BottomNav
// (Progress / Workout / History / Profile). Tab screens carry their own in-body
// large title, so headers are hidden here (matching web Layout's no-header).
export function TabNavigator() {
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: color.primary,
          tabBarInactiveTintColor: color.textFaint,
          tabBarStyle: {
            backgroundColor: color.bg,
            borderTopColor: color.border,
            height: layout.bottomNavH + 34,
            paddingTop: 6,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tab.Screen
          name="Progress"
          component={DashboardScreen}
          options={{ tabBarIcon: ({ focused }) => <ChartIcon size={24} color={focused ? color.primary : color.textFaint} /> }}
        />
        <Tab.Screen
          name="Workout"
          component={WorkoutScreen}
          options={{ tabBarIcon: ({ focused }) => <DumbbellIcon size={24} color={focused ? color.primary : color.textFaint} /> }}
        />
        <Tab.Screen
          name="History"
          component={SessionHistoryScreen}
          options={{ tabBarIcon: ({ focused }) => <ClockIcon size={24} color={focused ? color.primary : color.textFaint} /> }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} /> }}
        />
      </Tab.Navigator>
      <ResumeSessionBanner />
    </View>
  )
}
