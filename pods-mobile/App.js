import React from 'react'
import { View, StatusBar } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from './src/contexts/AuthContext'
import Login from './src/screens/Login'
import AppTabs from './src/navigation/AppTabs'
import TaskDetail from './src/screens/TaskDetail'
import ExtraTask from './src/screens/ExtraTask'
import TaskHistory from './src/screens/TaskHistory'

const Stack = createStackNavigator()

function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']} />
  }
  if (!user) return <Login />

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={AppTabs} />
        <Stack.Screen name="TaskDetail" component={TaskDetail} />
        <Stack.Screen name="ExtraTask" component={ExtraTask} />
        <Stack.Screen name="TaskHistory" component={TaskHistory} />
      </Stack.Navigator>
    </SafeAreaView>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AuthProvider>
        <NavigationContainer>
          <AppContent />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  )
}
