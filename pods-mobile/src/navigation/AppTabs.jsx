import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import HomeScreen from '../screens/Home'
import TasksStack from './TasksStack'
import NewsScreen from '../screens/News'
import ProfileScreen from '../screens/Profile'
import StaffListScreen from '../screens/StaffList'
import PointsHistoryScreen from '../screens/PointsHistory'
import AuditCenterScreen from '../screens/AuditCenter'
import ChatListScreen from '../screens/ChatList'
import ManagerTasksScreen from '../screens/ManagerTasks'
import CustomTabBar from './CustomTabBar'
import { TabBadgeProvider } from '../contexts/TabBadgeContext'
import { useAuth } from '../contexts/AuthContext'
import { useUiTheme } from '../contexts/UiThemeContext'
import {
  hasCompanyTasksTabAccess,
  hasManagementPrivileges,
  isPermTruthy,
} from '../lib/managementScope'

const Tab = createBottomTabNavigator()

export default function AppTabs() {
  const { permissions, personel, profile, loading, scopeReady } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin

  const isPermValueTruthy = (value) => value === true || value === 'true' || value === 1 || value === '1'
  const isManagerUser = hasManagementPrivileges(permissions, personel) || isPermTruthy(permissions, 'gorev_onayla')
  const showCompanyTasksTab = hasCompanyTasksTabAccess(permissions, personel)

  const canManageStaff =
    isManagerUser && (
      isPermValueTruthy(permissions?.manage_staff) ||
      isPermValueTruthy(permissions?.view_staff) ||
      isPermValueTruthy(permissions?.['personel.yonet']) ||
      isPermValueTruthy(permissions?.['personel_yonet']) ||
      isPermValueTruthy(permissions?.['sirket.yonet']) ||
      isPermValueTruthy(permissions?.['sube.yonet']) ||
      isPermValueTruthy(permissions?.['rol.yonet']
      ))

  const canViewReports =
    isManagerUser && (
      isPermValueTruthy(permissions?.view_reports) ||
      isPermValueTruthy(permissions?.puan_ver) ||
      isPermValueTruthy(permissions?.['puan.ver']) ||
      isPermValueTruthy(permissions?.['rapor.oku']) ||
      isPermValueTruthy(permissions?.['rapor_oku']
      ))

  const tabsReady = !loading && scopeReady
  const { theme } = useUiTheme()

  return (
    <TabBadgeProvider>
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: true,
        sceneContainerStyle: { backgroundColor: theme.pageBg },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: tabsReady && isManagerUser ? 'Yönetim' : 'Ana Sayfa' }}
      />
      <Tab.Screen
        name="Tasks"
        component={TasksStack}
        options={{ title: 'Görevler' }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault()
          },
        }}
      />

      {tabsReady ? (
        <Tab.Screen name="Chat" component={ChatListScreen} options={{ title: 'Sohbet' }} />
      ) : null}

      {tabsReady && isManagerUser ? (
        <Tab.Screen
          name="Denetim"
          component={AuditCenterScreen}
          options={{ title: 'Denetim' }}
        />
      ) : null}
      {tabsReady && showCompanyTasksTab ? (
        <Tab.Screen
          name="ManagerTasks"
          component={ManagerTasksScreen}
          options={{ title: 'Görevler' }}
        />
      ) : null}
      {tabsReady && !isManagerUser ? (
        <Tab.Screen name="News" component={NewsScreen} options={{ title: 'Duyurular' }} />
      ) : null}

      {/* Admin/Manager/UnitLead-only */}
      {tabsReady && canManageStaff ? (
        <Tab.Screen
          name="StaffList"
          component={StaffListScreen}
          options={{ title: 'Personeller' }}
        />
      ) : null}
      {tabsReady && (canViewReports || !isManagerUser) ? (
        <Tab.Screen
          name="PointsHistory"
          component={PointsHistoryScreen}
          options={{ title: 'Puan Geçmişi' }}
        />
      ) : null}

      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil' }} />
    </Tab.Navigator>
    </TabBadgeProvider>
  )
}
