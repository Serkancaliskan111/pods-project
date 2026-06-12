import React from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import { useUiTheme } from '../contexts/UiThemeContext'
import TasksTabPlaceholder from '../screens/TasksTabPlaceholder'
import TasksListScreen from '../screens/admin/tasks/TasksListScreen'

const Stack = createStackNavigator()

export default function TasksStack() {
  const { theme } = useUiTheme()
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: theme.pageBg },
      }}
    >
      <Stack.Screen name="TasksHub" component={TasksTabPlaceholder} />
      <Stack.Screen
        name="TasksList"
        component={TasksListScreen}
        initialParams={{ listMode: 'pending' }}
      />
      <Stack.Screen
        name="TasksUpcoming"
        component={TasksListScreen}
        initialParams={{ listMode: 'upcoming' }}
      />
    </Stack.Navigator>
  )
}
