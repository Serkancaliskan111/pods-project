import React, { useEffect, useState } from 'react'
import { Alert, AppState, BackHandler, Platform, StatusBar, StyleSheet, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import * as ScreenCapture from 'expo-screen-capture'
import * as Notifications from 'expo-notifications'
import { activateKeepAwakeAsync, deactivateKeepAwake, useKeepAwake } from 'expo-keep-awake'
import { AuthProvider, useAuth } from './src/contexts/AuthContext'
import Login from './src/screens/Login'
import AppTabs from './src/navigation/AppTabs'
import TaskDetail from './src/screens/TaskDetail'
import ExtraTask from './src/screens/ExtraTask'
import TaskHistory from './src/screens/TaskHistory'
import TaskDeletionCenter from './src/screens/TaskDeletionCenter'
import TaskOperationalEdit from './src/screens/TaskOperationalEdit'

const Stack = createStackNavigator()

function useBlockScreenCapture() {
  useEffect(() => {
    let active = true
    const run = async () => {
      try {
        await ScreenCapture.preventScreenCaptureAsync()
      } catch (e) {
        if (__DEV__) console.warn('[PODS] screen capture block failed', e?.message || e)
      }
    }
    void run()
    return () => {
      if (!active) return
      active = false
      // App kapanırken global engeli kaldır
      void ScreenCapture.allowScreenCaptureAsync().catch(() => {})
    }
  }, [])
}

function useScreenPrivacyGuards() {
  const [isForeground, setIsForeground] = useState(true)

  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      setIsForeground(nextState === 'active')
    })

    const screenshotSub = ScreenCapture.addScreenshotListener(() => {
      if (__DEV__) {
        console.warn('[PODS] screenshot event detected')
      }
    })

    return () => {
      appStateSub.remove()
      screenshotSub.remove()
    }
  }, [])

  return { isForeground }
}

function useRequestAppPermissions() {
  useEffect(() => {
    const run = async () => {
      try {
        const current = await Notifications.getPermissionsAsync()
        if (current.status !== 'granted') {
          await Notifications.requestPermissionsAsync()
        }
      } catch (e) {
        if (__DEV__) console.warn('[PODS] permission request failed', e?.message || e)
      }
    }
    void run()
  }, [])
}

function useDoubleConfirmAppExit(onBeforeExit) {
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert(
        'Çıkış Onayı',
        'Sistemden çıkmak istediğinize emin misiniz?',
        [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: 'Devam',
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                'Son Onay',
                'Uygulamayı kapatınca online durum takibi durabilir. Yine de çıkmak istiyor musunuz?',
                [
                  { text: 'Hayır', style: 'cancel' },
                  {
                    text: 'Evet, Çık',
                    style: 'destructive',
                    onPress: () => {
                      Promise.resolve(onBeforeExit?.())
                        .catch(() => {})
                        .finally(() => {
                          setTimeout(() => BackHandler.exitApp(), 160)
                        })
                    },
                  },
                ],
              )
            },
          },
        ],
      )
      return true
    })
    return () => sub.remove()
  }, [])
}

function useScreenAwakeLock() {
  useKeepAwake()
  useEffect(() => {
    const TAG = 'pods-main'
    const activate = async () => {
      try {
        await activateKeepAwakeAsync(TAG)
      } catch (e) {
        if (__DEV__) console.warn('[PODS] keep-awake activate failed', e?.message || e)
      }
    }
    void activate()
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void activate()
      }
    })
    return () => {
      appStateSub.remove()
      deactivateKeepAwake(TAG)
    }
  }, [])
}

function AppContent() {
  const { user, loading, scopeReady, markPresenceOffline } = useAuth()
  useDoubleConfirmAppExit(() => markPresenceOffline('Uygulama kapatildi'))

  if (loading || (user && !scopeReady)) {
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
        <Stack.Screen name="TaskDeletionCenter" component={TaskDeletionCenter} />
        <Stack.Screen name="TaskOperationalEdit" component={TaskOperationalEdit} />
      </Stack.Navigator>
    </SafeAreaView>
  )
}

export default function App() {
  useBlockScreenCapture()
  useScreenAwakeLock()
  useRequestAppPermissions()
  const { isForeground } = useScreenPrivacyGuards()

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AuthProvider>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <NavigationContainer>
            <AppContent />
          </NavigationContainer>
          {!isForeground ? <View pointerEvents="none" style={{ ...StyleSheet.absoluteFillObject, backgroundColor: '#000' }} /> : null}
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  )
}
