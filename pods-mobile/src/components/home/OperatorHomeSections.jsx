import React, { useCallback, useImperativeHandle, useState, forwardRef } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useAuth } from '../../contexts/AuthContext'
import { useUiTheme } from '../../contexts/UiThemeContext'
import { useCubicleHomeData } from '../../hooks/useCubicleHomeData'
import { hasManagementDashboardAccess } from '../../lib/permissions'
import HiddenTasksModal from '../HiddenTasksModal'
import OperatorHomeKpiStrip from './OperatorHomeKpiStrip'
import {
  OperatorHomeFocusCard,
  OperatorHomePointsCard,
  OperatorHomeRecentSection,
} from './OperatorHomeEngagement'
import UrgentTasksPanel from '../cubicle/UrgentTasksPanel'
import {
  Text as KitText,
  EmptyState as KitEmptyState,
  palette as kitPalette,
  spacing as kitSpacing,
  Icon,
} from '../../ui'

const OperatorHomeSections = forwardRef(function OperatorHomeSections(
  { sectionGapStyle, engagement = {} },
  ref,
) {
  const navigation = useNavigation()
  const { theme } = useUiTheme()
  const { personel, profile, permissions } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const management = hasManagementDashboardAccess(permissions, isSystemAdmin)

  const home = useCubicleHomeData()
  const {
    loading: cubicleLoading,
    enriching,
    reload: reloadCubicle,
    fetchError,
    overdue,
    today,
    tomorrow,
    urgentToday,
    hiddenOverdue,
    restoreHiddenToHome,
    restoringTaskId,
  } = home

  const [hiddenOpen, setHiddenOpen] = useState(false)

  const {
    pageLoading = false,
    nextTask,
    monthlyNetPoints = 0,
    gainedPointsToday = 0,
    streakDays = 0,
    displayName = '',
    recentCompleted = [],
    onOpenTask,
  } = engagement

  useImperativeHandle(ref, () => ({
    reload: reloadCubicle,
    openHiddenModal: () => setHiddenOpen(true),
  }))

  const openTask = useCallback(
    (taskOrId) => {
      const task = typeof taskOrId === 'object' ? taskOrId : { id: taskOrId }
      if (onOpenTask && task?.id != null) {
        onOpenTask(task.id)
        return
      }
      const mine = String(task?.sorumlu_personel_id || '') === String(personel?.id || '')
      navigation.navigate('TaskDetail', {
        taskId: task.id,
        focusComplete: !management && mine,
      })
    },
    [navigation, personel?.id, management, onOpenTask],
  )

  const openTasksList = useCallback(
    (screen = 'TasksPending') => {
      navigation.navigate('Tasks', { screen })
    },
    [navigation],
  )

  const hasTasks =
    overdue.length > 0 || today.length > 0 || tomorrow.length > 0 || urgentToday.length > 0

  const gap = sectionGapStyle || styles.sectionGap
  const showInitialLoader = cubicleLoading && !hasTasks && pageLoading

  if (showInitialLoader) {
    return (
      <View style={[styles.loaderWrap, gap]}>
        <ActivityIndicator size="large" color={theme.brandBlue} />
      </View>
    )
  }

  return (
    <>
      <UrgentTasksPanel
        tasks={urgentToday}
        loading={cubicleLoading}
        onOpenTask={openTask}
        style={gap}
      />

      <OperatorHomePointsCard
        firstName={personel?.ad}
        lastName={personel?.soyad}
        fallbackName={displayName}
        profilePhotoPath={profile?.profil_foto_yol}
        monthlyNetPoints={monthlyNetPoints}
        gainedPointsToday={gainedPointsToday}
        todayTaskCount={today.length}
        streakDays={streakDays}
        onPress={() => navigation.navigate('PointsHistory')}
        style={gap}
      />

      <OperatorHomeFocusCard nextTask={nextTask} onOpenTask={onOpenTask} style={gap} />

      <OperatorHomeKpiStrip
        loading={cubicleLoading && !hasTasks}
        overdue={overdue.length}
        today={today.length}
        tomorrow={tomorrow.length}
        urgent={urgentToday.length}
        onPressOverdue={() => openTasksList('TasksPending')}
        onPressToday={() => openTasksList('TasksPending')}
        onPressTomorrow={() => openTasksList('TasksUpcoming')}
        onPressUrgent={() => openTasksList('TasksPending')}
        style={gap}
      />

      {fetchError ? (
        <KitText variant="bodySm" color={kitPalette.danger[600]} style={gap}>
          {fetchError}
        </KitText>
      ) : null}

      {enriching && hasTasks ? (
        <KitText variant="caption" color={kitPalette.slate[400]} align="center" style={gap}>
          Zincir görevleri güncelleniyor…
        </KitText>
      ) : null}

      {!cubicleLoading && !hasTasks ? (
        <KitEmptyState
          tone="soft"
          icon={<Icon.Tasks size={28} color={kitPalette.primary[600]} strokeWidth={1.6} />}
          title="Aktif görev yok"
          description="Yeni görev atandığında burada görünür. Ekstra görev için alttaki + düğmesini kullanın."
          style={gap}
        />
      ) : null}

      <OperatorHomeRecentSection
        items={recentCompleted}
        onOpenTask={onOpenTask}
        style={gap}
      />

      <HiddenTasksModal
        visible={hiddenOpen}
        onClose={() => setHiddenOpen(false)}
        tasks={hiddenOverdue}
        loading={cubicleLoading}
        onRestore={restoreHiddenToHome}
        restoringId={restoringTaskId}
        onOpenTask={(task) => {
          setHiddenOpen(false)
          openTask(task)
        }}
      />

    </>
  )
})

export default OperatorHomeSections

const styles = StyleSheet.create({
  sectionGap: {
    marginBottom: kitSpacing.lg,
  },
  loaderWrap: {
    paddingVertical: kitSpacing['2xl'],
    alignItems: 'center',
  },
})
