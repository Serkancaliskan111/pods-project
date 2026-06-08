import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { ChevronDown, ChevronRight } from 'lucide-react-native'
import getSupabase from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { useUiTheme } from '../../contexts/UiThemeContext'
import { useCubicleHomeData } from '../../hooks/useCubicleHomeData'
import { isForceShownOnHome } from '../../lib/taskHomeHidden'
import { hasManagementDashboardAccess } from '../../lib/permissions'
import { navigateMobileRoute } from '../../lib/mobileAdminNav'
import { formatFullName } from '../../lib/nameFormat'
import CubicleTaskCard from '../../components/CubicleTaskCard'
import HiddenTasksModal from '../../components/HiddenTasksModal'
import OperatorHomeHeader from '../../components/home/OperatorHomeHeader'
import UrgentTasksPanel from '../../components/cubicle/UrgentTasksPanel'
import { useTabBarScrollPadding } from '../../navigation/tabBarLayout'
import {
  Screen,
  Text,
  Heading,
  Icon,
  palette,
  spacing,
  radii,
  shadows,
} from '../../ui'

const supabase = getSupabase()

function getTodayDateString() {
  return new Date().toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function getGreetingText() {
  const hour = new Date().getHours()
  if (hour < 6) return 'İyi geceler'
  if (hour < 12) return 'Günaydın'
  if (hour < 18) return 'İyi günler'
  return 'İyi akşamlar'
}

function TaskBucketSection({ label, count, color, open, onToggle, children, emptyHint }) {
  if (count === 0) return null

  return (
    <View style={styles.bucket}>
      <TouchableOpacity
        style={[styles.bucketHeader, { backgroundColor: color }]}
        onPress={onToggle}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text variant="bodySm" weight="Bold" color={palette.surface}>
          {label} ({count})
        </Text>
        {open ? (
          <ChevronDown size={18} color="rgba(255,255,255,0.9)" strokeWidth={2.5} />
        ) : (
          <ChevronRight size={18} color="rgba(255,255,255,0.9)" strokeWidth={2.5} />
        )}
      </TouchableOpacity>
      {open ? (
        <View style={styles.bucketBody}>
          {children?.length ? children : (
            <Text variant="bodySm" color={palette.slate[500]} style={styles.bucketEmpty}>
              {emptyHint}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  )
}

export default function OperatorCubicleHome() {
  const tabBarPad = useTabBarScrollPadding()
  const navigation = useNavigation()
  const { theme } = useUiTheme()
  const { user, profile, personel, permissions } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const management = hasManagementDashboardAccess(permissions, isSystemAdmin)

  const [resolvedCompanyName, setResolvedCompanyName] = useState(null)
  const [resolvedUnitName, setResolvedUnitName] = useState(null)

  const home = useCubicleHomeData()
  const {
    loading,
    enriching,
    reload,
    fetchError,
    overdue,
    today,
    tomorrow,
    urgentToday,
    hideFromHome,
    hidingTaskId,
    forceShowIds,
    loadedAt,
    operatorMode,
    hiddenOverdue,
    hiddenCount,
    restoreHiddenToHome,
    restoringTaskId,
    totalTasks,
  } = home

  const [overdueOpen, setOverdueOpen] = useState(true)
  const [todayOpen, setTodayOpen] = useState(true)
  const [tomorrowOpen, setTomorrowOpen] = useState(false)
  const [hiddenOpen, setHiddenOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const bucketsSyncedRef = useRef(false)

  useEffect(() => {
    let mounted = true
    const resolveNames = async () => {
      if (!personel?.ana_sirket_id) {
        if (mounted) {
          setResolvedCompanyName(null)
          setResolvedUnitName(null)
        }
        return
      }
      try {
        const unitReq =
          personel?.birim_id != null && String(personel.birim_id) !== ''
            ? supabase
                .from('birimler')
                .select('birim_adi')
                .eq('id', personel.birim_id)
                .eq('ana_sirket_id', personel.ana_sirket_id)
                .maybeSingle()
            : Promise.resolve({ data: null })

        const [{ data: companyData }, { data: unitData }] = await Promise.all([
          supabase.from('ana_sirketler').select('ana_sirket_adi').eq('id', personel.ana_sirket_id).maybeSingle(),
          unitReq,
        ])

        if (mounted) {
          setResolvedCompanyName(companyData?.ana_sirket_adi || null)
          setResolvedUnitName(unitData?.birim_adi || null)
        }
      } catch {
        if (mounted) {
          setResolvedCompanyName(null)
          setResolvedUnitName(null)
        }
      }
    }
    void resolveNames()
    return () => {
      mounted = false
    }
  }, [personel?.ana_sirket_id, personel?.birim_id])

  useEffect(() => {
    if (loading) return
    if (bucketsSyncedRef.current) return
    bucketsSyncedRef.current = true
    setOverdueOpen(overdue.length > 0)
    setTodayOpen(today.length > 0)
    setTomorrowOpen(tomorrow.length > 0)
  }, [loading, overdue.length, today.length, tomorrow.length])

  const displayName = useMemo(() => {
    const raw =
      formatFullName(personel?.ad, personel?.soyad) ||
      (personel?.ad ? String(personel.ad).trim() : '') ||
      (user?.email ? String(user.email).split('@')[0] : 'Personel')
    if (!raw) return 'Personel'
    return raw.charAt(0).toLocaleUpperCase('tr-TR') + raw.slice(1).toLocaleLowerCase('tr-TR')
  }, [personel?.ad, personel?.soyad, user?.email])

  const greetingSubtitle = useMemo(() => {
    const company = resolvedCompanyName || 'Şirket'
    const unit = resolvedUnitName
    return unit ? `${company} • ${unit}` : company
  }, [resolvedCompanyName, resolvedUnitName])

  const quickLinks = useMemo(
    () => [
      {
        key: 'points',
        label: 'Puanım',
        tone: 'success',
        Icon: Icon.Points,
        onPress: () => navigation.navigate('PointsHistory'),
      },
      {
        key: 'history',
        label: 'Geçmiş',
        tone: 'primary',
        Icon: Icon.Clock,
        onPress: () => navigation.navigate('TaskHistory'),
      },
      {
        key: 'tasks',
        label: 'Tüm görevler',
        tone: 'accent',
        Icon: Icon.Tasks,
        onPress: () => navigateMobileRoute(navigation, 'TasksPending'),
      },
    ],
    [navigation],
  )

  const openTask = useCallback(
    (task) => {
      const mine = String(task?.sorumlu_personel_id || '') === String(personel?.id || '')
      navigation.navigate('TaskDetail', { taskId: task.id, focusComplete: !management && mine })
    },
    [navigation, personel?.id, management],
  )

  const taskHideProps = useCallback(
    (task) => {
      if (!operatorMode || !hideFromHome) return {}
      if (!isForceShownOnHome(task, loadedAt, forceShowIds)) return {}
      return {
        onHideFromHome: () => hideFromHome(task),
        hidingFromHome: hidingTaskId === task.id,
      }
    },
    [operatorMode, hideFromHome, loadedAt, forceShowIds, hidingTaskId],
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    bucketsSyncedRef.current = false
    await reload()
    setRefreshing(false)
  }, [reload])

  const hasBuckets =
    overdue.length > 0 || today.length > 0 || tomorrow.length > 0 || urgentToday.length > 0

  const renderList = (items) =>
    items.map((task) => {
      const hide = taskHideProps(task)
      return (
        <CubicleTaskCard
          key={task.id}
          task={task}
          onPress={() => openTask(task)}
          onHideFromHome={hide.onHideFromHome}
          hidingFromHome={hide.hidingFromHome}
        />
      )
    })

  const toggleBucket = (setter) => () => setter((v) => !v)

  return (
    <View style={[styles.shell, { backgroundColor: theme.pageBg }]}>
      <OperatorHomeHeader
        greeting={getGreetingText()}
        dateLabel={getTodayDateString()}
        displayName={displayName}
        subtitle={greetingSubtitle}
        hiddenCount={hiddenCount}
        onPressHidden={() => setHiddenOpen(true)}
        loading={loading && !hasBuckets}
        stats={{
          overdue: overdue.length,
          today: today.length,
          tomorrow: tomorrow.length,
          urgent: urgentToday.length,
        }}
        quickLinks={quickLinks}
        style={{ backgroundColor: theme.pageBg }}
      />

      <Screen
        scroll
        padded
        topInset={false}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarPad }]}
      >
        {fetchError ? (
          <Text variant="bodySm" color={palette.danger[600]} style={styles.error}>
            {fetchError}
          </Text>
        ) : null}

        {loading && !hasBuckets ? (
          <ActivityIndicator size="large" color={theme.brandBlue} style={styles.loader} />
        ) : null}

        {!loading && hasBuckets ? (
          <>
            <View style={styles.sectionHead}>
              <Heading variant="h3" color={palette.slate[900]}>
                Görevlerim
              </Heading>
              {totalTasks > 0 ? (
                <Text variant="caption" color={palette.slate[400]}>
                  {totalTasks} aktif
                </Text>
              ) : null}
            </View>

            {enriching ? (
              <Text variant="caption" color={palette.slate[400]} style={styles.enrichHint}>
                Zincir görevleri güncelleniyor…
              </Text>
            ) : null}

            <UrgentTasksPanel
              tasks={urgentToday}
              loading={loading}
              onOpenTask={openTask}
              style={styles.sectionGap}
            />

            <TaskBucketSection
              label="Gecikmiş"
              count={overdue.length}
              color={theme.section.overdue}
              open={overdueOpen}
              onToggle={toggleBucket(setOverdueOpen)}
              emptyHint="Gecikmiş görev yok."
            >
              {renderList(overdue)}
            </TaskBucketSection>

            <TaskBucketSection
              label="Bugün"
              count={today.length}
              color={theme.section.today}
              open={todayOpen}
              onToggle={toggleBucket(setTodayOpen)}
              emptyHint="Bugün için planlı görev yok."
            >
              {renderList(today)}
            </TaskBucketSection>

            <TaskBucketSection
              label="Yarın"
              count={tomorrow.length}
              color={theme.section.tomorrow}
              open={tomorrowOpen}
              onToggle={toggleBucket(setTomorrowOpen)}
              emptyHint="Yarın için planlı görev yok."
            >
              {renderList(tomorrow)}
            </TaskBucketSection>
          </>
        ) : null}

        {!loading && !hasBuckets ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Icon.Tasks size={28} color={palette.slate[400]} strokeWidth={1.8} />
            </View>
            <Text variant="bodyMd" weight="SemiBold" color={palette.slate[700]} align="center">
              Aktif görev yok
            </Text>
            <Text variant="bodySm" color={palette.slate[500]} align="center" style={styles.emptyHint}>
              Yeni görev atandığında burada listelenir. Ekstra görev eklemek için alttaki + düğmesini kullanın.
            </Text>
          </View>
        ) : null}
      </Screen>

      <HiddenTasksModal
        visible={hiddenOpen}
        onClose={() => setHiddenOpen(false)}
        tasks={hiddenOverdue}
        loading={loading}
        onRestore={restoreHiddenToHome}
        restoringId={restoringTaskId}
        onOpenTask={(task) => {
          setHiddenOpen(false)
          openTask(task)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  scrollContent: {
    paddingTop: spacing.xs,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sectionGap: { marginBottom: spacing.md },
  error: { marginBottom: spacing.md },
  loader: { marginTop: spacing.xl },
  enrichHint: { marginBottom: spacing.sm },
  bucket: {
    marginBottom: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.slate[200],
    overflow: 'hidden',
    ...shadows.sm,
  },
  bucketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bucketBody: {
    padding: spacing.sm,
    paddingTop: spacing.xs,
  },
  bucketEmpty: {
    padding: spacing.lg,
    textAlign: 'center',
  },
  emptyWrap: {
    marginTop: spacing.lg,
    padding: spacing.xl,
    borderRadius: radii['2xl'],
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.slate[200],
    alignItems: 'center',
    ...shadows.sm,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyHint: {
    marginTop: spacing.xs,
    lineHeight: 20,
  },
})
