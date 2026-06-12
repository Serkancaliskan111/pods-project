import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  View,
} from 'react-native'
import { DefaultTheme, NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from 'react-native-safe-area-context'
import * as ScreenCapture from 'expo-screen-capture'
import { loadNotificationsModule } from './src/lib/notifications'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans'
import { activateKeepAwakeAsync, deactivateKeepAwake, useKeepAwake } from 'expo-keep-awake'
import { AuthProvider, useAuth } from './src/contexts/AuthContext'
import { UiThemeProvider, useUiTheme } from './src/contexts/UiThemeContext'
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
import AuditApproved from './src/screens/admin/audit/AuditApproved'
import AnnouncementsList from './src/screens/admin/announcements/AnnouncementsList'
import PresenceIndex from './src/screens/admin/presence/PresenceIndex'
import PresenceDetail from './src/screens/admin/presence/PresenceDetail'
import AuditCenter from './src/screens/AuditCenter'
import StaffList from './src/screens/StaffList'
import News from './src/screens/News'
import TaskCalendar from './src/screens/admin/calendar/TaskCalendar'
import PersonalTodoList from './src/screens/admin/personalTodo/PersonalTodoList'
import CustomerRatingsList from './src/screens/admin/customerRatings/CustomerRatingsList'
import CustomerRatingShow from './src/screens/admin/customerRatings/CustomerRatingShow'
import ProjectsList from './src/screens/admin/projects/ProjectsList'
import ProjectShow from './src/screens/admin/projects/ProjectShow'
import ProjectEdit from './src/screens/admin/projects/ProjectEdit'
import ProjectTaskAssignScreen from './src/screens/admin/projects/ProjectTaskAssignScreen'
import CompaniesList from './src/screens/admin/org/CompaniesList'
import CompanyForm from './src/screens/admin/org/CompanyForm'
import UnitsList from './src/screens/admin/org/UnitsList'
import UnitForm from './src/screens/admin/org/UnitForm'
import RolesList from './src/screens/admin/org/RolesList'
import RoleForm from './src/screens/admin/org/RoleForm'
import StaffForm from './src/screens/admin/org/StaffForm'
import TaskTemplatesList from './src/screens/admin/templates/TaskTemplatesList'
import TaskTemplateBuilder from './src/screens/admin/templates/TaskTemplateBuilder'
import { palette } from './src/theme/palette'
import { patchTextInputGlobals } from './src/ui/TextInput'

function ThemedStatusBar() {
  const { theme } = useUiTheme()
  return (
    <StatusBar
      barStyle="dark-content"
      backgroundColor={theme.pageBg}
      translucent={Platform.OS === 'android'}
    />
  )
}

const Stack = createStackNavigator()

/**
 * Splash görünür kalsın; fontlar ve auth scope hazır olmadan UI render edilmesin.
 * `preventAutoHideAsync` modül seviyesinde çağrılır (Expo dokümanına göre).
 */
SplashScreen.preventAutoHideAsync().catch(() => {})

/**
 * Ekranların kullandığı `Colors.background` ile aynı renk.
 * Status bar ve home indicator arkasına bu renk uzanır; böylece iOS'ta
 * üst/alt safe area şeritleri ekran arkaplanından ayrışmaz.
 */
function useNavigationTheme() {
  const { theme } = useUiTheme()
  return useMemo(
    () => ({
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        background: theme.pageBg,
        primary: theme.brandBlue,
        card: theme.pageBg,
        border: theme.border,
        text: palette.slate[800],
      },
    }),
    [theme.pageBg, theme.brandBlue, theme.cardBg, theme.border],
  )
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
    const run = async () => {
      try {
        const Notifications = await loadNotificationsModule()
        if (!Notifications) return
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
  const { theme } = useUiTheme()
  useDoubleConfirmAppExit(() => markPresenceOffline('Uygulama kapatildi'))
  usePostAuthNotificationPermission()

  return (
    <View style={{ flex: 1, backgroundColor: theme.pageBg }}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: theme.pageBg },
        }}
      >
        <Stack.Screen name="Tabs" component={AppTabs} />
        <Stack.Screen name="TaskDetail" component={TaskDetail} />
        <Stack.Screen name="ExtraTask" component={ExtraTask} />
        <Stack.Screen name="TaskHistory" component={TaskHistory} />
        <Stack.Screen name="TaskDeletionCenter" component={TaskDeletionCenter} />
        <Stack.Screen name="TaskOperationalEdit" component={TaskOperationalEdit} />
        <Stack.Screen name="ChatRoom" component={ChatRoom} />
        <Stack.Screen name="ChatNewDm" component={ChatNewDm} />
        <Stack.Screen name="ChatNewGroup" component={ChatNewGroup} />
        <Stack.Screen name="AuditCenter" component={AuditCenter} />
        <Stack.Screen name="AuditApproved" component={AuditApproved} />
        <Stack.Screen name="AnnouncementsList" component={AnnouncementsList} />
        <Stack.Screen name="PresenceIndex" component={PresenceIndex} />
        <Stack.Screen name="PresenceDetail" component={PresenceDetail} />
        <Stack.Screen name="StaffList" component={StaffList} />
        <Stack.Screen name="News" component={News} />
        <Stack.Screen name="TaskCalendar" component={TaskCalendar} />
        <Stack.Screen name="PersonalTodoList" component={PersonalTodoList} />
        <Stack.Screen name="CustomerRatingsList" component={CustomerRatingsList} />
        <Stack.Screen name="CustomerRatingShow" component={CustomerRatingShow} />
        <Stack.Screen name="ProjectsList" component={ProjectsList} />
        <Stack.Screen name="ProjectShow" component={ProjectShow} />
        <Stack.Screen name="ProjectTaskAssign" component={ProjectTaskAssignScreen} />
        <Stack.Screen name="ProjectEdit" component={ProjectEdit} />
        <Stack.Screen name="CompaniesList" component={CompaniesList} />
        <Stack.Screen name="CompanyForm" component={CompanyForm} />
        <Stack.Screen name="UnitsList" component={UnitsList} />
        <Stack.Screen name="UnitForm" component={UnitForm} />
        <Stack.Screen name="RolesList" component={RolesList} />
        <Stack.Screen name="RoleForm" component={RoleForm} />
        <Stack.Screen name="StaffForm" component={StaffForm} />
        <Stack.Screen name="TaskTemplatesList" component={TaskTemplatesList} />
        <Stack.Screen name="TaskTemplateBuilder" component={TaskTemplateBuilder} />
      </Stack.Navigator>
    </View>
  )
}

/** Giriş ekranı kendi klavye düzenini yönetir; çift KeyboardAvoidingView dokunmayı bozabiliyor. */
function AppKeyboardShell({ children, onLayoutRootView }) {
  const { user, loading } = useAuth()
  const { theme } = useUiTheme()
  const useKeyboardAvoiding = Boolean(user) && !loading

  const body = (
    <View
      style={{ flex: 1, backgroundColor: theme.pageBg }}
      onLayout={onLayoutRootView}
    >
      {children}
    </View>
  )

  if (!useKeyboardAvoiding) return body

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.pageBg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
    >
      {body}
    </KeyboardAvoidingView>
  )
}

function AppContent() {
  const { user, loading, scopeReady, markPresenceOffline } = useAuth()
  const { theme } = useUiTheme()
  const navigationTheme = useNavigationTheme()

  if (loading || (user && !scopeReady)) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.pageBg, alignItems: 'center', justifyContent: 'center' }}
        edges={['top', 'bottom']}
      >
        <ActivityIndicator size="large" color={theme.brandBlue} />
      </SafeAreaView>
    )
  }
  if (!user) return <Login />

  return (
    <NavigationContainer theme={navigationTheme}>
      <AuthenticatedShell markPresenceOffline={markPresenceOffline} />
    </NavigationContainer>
  )
}

export default function App() {
  useBlockScreenCapture()
  useScreenAwakeLock()
  const { isForeground } = useScreenPrivacyGuards()

  /**
   * Plus Jakarta Sans alias'larını yükle. Anahtar adları (`PlusJakartaSans-*`)
   * `theme/typography.js` içindeki `fontFamily` referansları ile birebir
   * eşleşir; her metin componenti aynı aile adını kullanır.
   */
  const [fontsLoaded, fontsError] = useFonts({
    'PlusJakartaSans-Regular': PlusJakartaSans_400Regular,
    'PlusJakartaSans-Medium': PlusJakartaSans_500Medium,
    'PlusJakartaSans-SemiBold': PlusJakartaSans_600SemiBold,
    'PlusJakartaSans-Bold': PlusJakartaSans_700Bold,
    'PlusJakartaSans-ExtraBold': PlusJakartaSans_800ExtraBold,
  })

  const fontsReady = fontsLoaded || Boolean(fontsError)

  /**
   * Henüz UI Kit'e geçmemiş ekranlarda da Plus Jakarta Sans'in default
   * olarak uygulanması için `<Text>` ve `<TextInput>`'un default style'ını
   * font ailesi ile patch'liyoruz. RN 0.81+ `defaultProps` deprecated uyarısı
   * verir ama yine de çalışır; modern alternatifi olan context tabanlı
   * çözümün her ekrana sarmal eklemesi pragmatik değil.
   */
  useEffect(() => {
    if (!fontsLoaded) return
    const patchDefaults = (Component) => {
      const prev = Component.defaultProps?.style
      Component.defaultProps = Component.defaultProps || {}
      Component.defaultProps.style = [
        { fontFamily: 'PlusJakartaSans-Medium' },
        ...(Array.isArray(prev) ? prev : prev ? [prev] : []),
      ]
    }
    try {
      patchDefaults(RNText)
      patchTextInputGlobals(RNTextInput)
    } catch (e) {
      if (__DEV__) console.warn('[PODS] default font patch failed', e?.message || e)
    }
  }, [fontsLoaded])

  const onLayoutRootView = useCallback(async () => {
    if (fontsReady) {
      try {
        await SplashScreen.hideAsync()
      } catch (e) {
        if (__DEV__) console.warn('[PODS] splash hide failed', e?.message || e)
      }
    }
  }, [fontsReady])

  if (!fontsReady) {
    // Fontlar yüklenmeden bütün metinler "system font flash" yapar; splash
    // ekranı açık kalsın diye hiçbir şey render etmiyoruz. preventAutoHide
    // çağrısı modül seviyesinde yapıldı.
    return null
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AuthProvider>
        <UiThemeProvider>
          <ThemedStatusBar />
          <AppKeyboardShell onLayoutRootView={onLayoutRootView}>
            <AppContent />
          {!isForeground ? (
            <View
              pointerEvents="none"
              style={{ ...StyleSheet.absoluteFillObject, backgroundColor: '#000' }}
            />
          ) : null}
          </AppKeyboardShell>
        </UiThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  )
}
