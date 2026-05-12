import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native'
import { DefaultTheme, NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import * as ScreenCapture from 'expo-screen-capture'
import * as Notifications from 'expo-notifications'
import { activateKeepAwakeAsync, deactivateKeepAwake, useKeepAwake } from 'expo-keep-awake'
import { isExpoGoClient } from './src/lib/expoGoNotifications'
import { AuthProvider, useAuth } from './src/contexts/AuthContext'
import Login from './src/screens/Login'
import AppTabs from './src/navigation/AppTabs'
import TaskDetail from './src/screens/TaskDetail'
import ExtraTask from './src/screens/ExtraTask'
import TaskHistory from './src/screens/TaskHistory'
import TaskDeletionCenter from './src/screens/TaskDeletionCenter'
import TaskOperationalEdit from './src/screens/TaskOperationalEdit'
import ChatList from './src/screens/ChatList'
import ChatRoom from './src/screens/ChatRoom'
import ChatNewDm from './src/screens/ChatNewDm'
import ChatNewGroup from './src/screens/ChatNewGroup'

const Stack = createStackNavigator()

/** İlk frame ve geçişlerde flash olmasın (Splash / sistem varsayılanı yerine tutarlı açılış). */
const ROOT_SURFACE_BG = '#ffffff'

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: ROOT_SURFACE_BG,
  },
}

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

/** Bildirim izni giriş/kapsam hazır olduktan sonra — ilk JS turunu ve giriş ekranını bloklamaz. */
function usePostAuthNotificationPermission() {
  useEffect(() => {
    if (isExpoGoClient()) return
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

function AuthenticatedShell({ markPresenceOffline }) {
  useDoubleConfirmAppExit(() => markPresenceOffline('Uygulama kapatildi'))
  usePostAuthNotificationPermission()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ROOT_SURFACE_BG }} edges={['top']}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={AppTabs} />
        <Stack.Screen name="TaskDetail" component={TaskDetail} />
        <Stack.Screen name="ExtraTask" component={ExtraTask} />
        <Stack.Screen name="TaskHistory" component={TaskHistory} />
        <Stack.Screen name="TaskDeletionCenter" component={TaskDeletionCenter} />
        <Stack.Screen name="TaskOperationalEdit" component={TaskOperationalEdit} />
        <Stack.Screen name="ChatRoom" component={ChatRoom} />
        <Stack.Screen name="ChatNewDm" component={ChatNewDm} />
        <Stack.Screen name="ChatNewGroup" component={ChatNewGroup} />
      </Stack.Navigator>
    </SafeAreaView>
  )
}

function AppContent() {
  const { user, loading, scopeReady, markPresenceOffline } = useAuth()

  if (loading || (user && !scopeReady)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: ROOT_SURFACE_BG, alignItems: 'center', justifyContent: 'center' }} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    )
  }
  if (!user) return <Login />

  return <AuthenticatedShell markPresenceOffline={markPresenceOffline} />
}

export default function App() {
  useBlockScreenCapture()
  useScreenAwakeLock()
  const { isForeground } = useScreenPrivacyGuards()

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AuthProvider>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
        >
          <View style={{ flex: 1, backgroundColor: ROOT_SURFACE_BG }}>
            <NavigationContainer theme={navigationTheme}>
              <AppContent />
            </NavigationContainer>
            {!isForeground ? <View pointerEvents="none" style={{ ...StyleSheet.absoluteFillObject, backgroundColor: '#000' }} /> : null}
          </View>
        </KeyboardAvoidingView>
      </AuthProvider>
    </SafeAreaProvider>
  )
}
