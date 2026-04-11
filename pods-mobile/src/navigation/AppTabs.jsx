import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import HomeScreen from '../screens/Home'
import TasksScreen from '../screens/Tasks'
import NewsScreen from '../screens/News'
import ProfileScreen from '../screens/Profile'
import StaffListScreen from '../screens/StaffList'
import PointsHistoryScreen from '../screens/PointsHistory'
import AuditCenterScreen from '../screens/AuditCenter'
import CustomTabBar from './CustomTabBar'
import { useAuth } from '../contexts/AuthContext'
import { hasManagementPrivileges, isPermTruthy } from '../lib/managementScope'

const Tab = createBottomTabNavigator()

export default function AppTabs() {
  const { permissions, personel, loading } = useAuth()

  const isPermValueTruthy = (value) => value === true || value === 'true' || value === 1 || value === '1'
  const isManagerUser = hasManagementPrivileges(permissions, personel) || isPermTruthy(permissions, 'gorev_onayla')

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

  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: !loading && isManagerUser ? 'Yönetim' : 'Ana Sayfa' }}
      />
      <Tab.Screen name="Tasks" component={TasksScreen} options={{ title: 'Görevler' }} />

      {!loading && isManagerUser ? (
        <Tab.Screen
          name="Denetim"
          component={AuditCenterScreen}
          options={{ title: 'Denetim' }}
        />
      ) : null}

      {!loading && !isManagerUser ? (
        <Tab.Screen name="News" component={NewsScreen} options={{ title: 'Duyurular' }} />
      ) : null}

      {/* Admin/Manager/UnitLead-only */}
      {!loading && canManageStaff ? (
        <Tab.Screen
          name="StaffList"
          component={StaffListScreen}
          options={{ title: 'Personeller' }}
        />
      ) : null}
      {!loading && (canViewReports || !isManagerUser) ? (
        <Tab.Screen
          name="PointsHistory"
          component={PointsHistoryScreen}
          options={{ title: 'Puan Geçmişi' }}
        />
      ) : null}

      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil' }} />
    </Tab.Navigator>
  )
}
