import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StyleSheet,
} from 'react-native'
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native'
import {
  LayoutDashboard,
  ListTree,
  Users,
  Plus,
  Pencil,
} from 'lucide-react-native'
import { useAuth } from '../../../contexts/AuthContext'
import { useUiTheme } from '../../../contexts/UiThemeContext'
import {
  fetchProjectById,
  fetchProjectMembers,
  fetchProjectTasks,
  fetchProjectOperationalTasks,
  fetchProjectUnitLabel,
  softDeleteProjectTask,
} from '../../../lib/projectApi'
import { mergeProjectTaskSources } from '../../../lib/projectTasksMerge'
import { computeProjectProgress } from '../../../lib/projectGanttUtils'
import { canManageProjectRecord, splitProjectMembers } from '../../../lib/projectAccess'
import { canAssignTask } from '../../../lib/permissions'
import { buildOperationalPrefillParams } from '../../../lib/projectTaskOperationalPrefill'
import { getProjectStatusOption } from '../../../lib/projectStatus'
import { buildProjectSummary } from '../../../lib/projectSummary'
import {
  buildProjectUrgentAlerts,
  computeProjectManagerKpis,
} from '../../../lib/projectManagerDashboard'
import {
  getProjectAssigneeName,
  mapProjectTasksForPodsUI,
} from '../../../lib/projectTaskPodsAdapter'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import ProjectShowOverview from '../../../components/projects/ProjectShowOverview'
import ProjectTasksTab from '../../../components/projects/ProjectTasksTab'
import ProjectTeamCompactSection from '../../../components/projects/ProjectTeamCompactSection'
import {
  Text,
  Button,
  palette,
  spacing,
  radii,
} from '../../../ui'

const TABS = [
  { id: 'ozet', label: 'Özet', icon: LayoutDashboard },
  { id: 'gorevler', label: 'Görevler', icon: ListTree },
  { id: 'ekip', label: 'Ekip', icon: Users },
]

export default function ProjectShow() {
  const navigation = useNavigation()
  const route = useRoute()
  const projectId = route.params?.projectId
  const { personel, profile, permissions } = useAuth()
  const { theme } = useUiTheme()
  const isSystemAdmin = !!profile?.is_system_admin

  const scopeCtx = useMemo(
    () => ({
      isSystemAdmin,
      currentCompanyId: personel?.ana_sirket_id || null,
      accessibleUnitIds: personel?.accessibleUnitIds,
      isTopCompanyScope: personel?.isTopCompanyScope,
      fallbackBirimId: personel?.birim_id,
    }),
    [isSystemAdmin, personel],
  )

  const [tab, setTab] = useState('ozet')
  const [project, setProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [authorizedMembers, setAuthorizedMembers] = useState([])
  const [birimLabel, setBirimLabel] = useState('')
  const [mayManage, setMayManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)
  const skipFocusReloadRef = useRef(true)
  const [tasksListMode, setTasksListMode] = useState('pending')
  const [tasksQuickFilter, setTasksQuickFilter] = useState('all')
  const mayAssignOperational =
    mayManage && canAssignTask(permissions, isSystemAdmin, personel)

  const mappedTasks = useMemo(() => mapProjectTasksForPodsUI(tasks), [tasks])
  const progress = useMemo(() => computeProjectProgress(mappedTasks), [mappedTasks])
  const summary = useMemo(
    () => (project ? buildProjectSummary(project, mappedTasks) : null),
    [project, mappedTasks],
  )
  const kpis = useMemo(() => computeProjectManagerKpis(mappedTasks, null), [mappedTasks])
  const alerts = useMemo(
    () => buildProjectUrgentAlerts(mappedTasks, null).filter((a) => a.key !== 'blocked'),
    [mappedTasks],
  )

  const personMap = useMemo(() => {
    const m = {}
    for (const p of [...teamMembers, ...authorizedMembers]) {
      m[String(p.personel_id)] = p
    }
    return m
  }, [teamMembers, authorizedMembers])

  useFocusEffect(
    useCallback(() => {
      if (skipFocusReloadRef.current) {
        skipFocusReloadRef.current = false
        return
      }
      setReloadTick((t) => t + 1)
    }, []),
  )

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!projectId) return
      setLoading(true)
      try {
        const [p, t, ops, members] = await Promise.all([
          fetchProjectById(projectId, scopeCtx, {
            personelId: personel?.id,
            userId: profile?.id,
          }),
          fetchProjectTasks(projectId),
          fetchProjectOperationalTasks(projectId),
          fetchProjectMembers(projectId),
        ])
        if (cancelled) return
        if (!p) {
          Alert.alert('Hata', 'Proje bulunamadı veya erişim yetkiniz yok')
          navigation.goBack()
          return
        }
        const { team, authorized } = splitProjectMembers(members)
        const canManage = canManageProjectRecord({
          isSystemAdmin,
          permissions,
          personelId: personel?.id,
          userId: profile?.id,
          project: p,
          members,
        })
        const unitLabel = p.birim_id ? await fetchProjectUnitLabel(p.birim_id) : ''
        setProject(p)
        setTasks(mergeProjectTaskSources(t, ops, projectId))
        setTeamMembers(team)
        setAuthorizedMembers(authorized)
        setBirimLabel(unitLabel || '')
        setMayManage(canManage)
      } catch (e) {
        if (__DEV__) console.warn('ProjectShow', e)
        if (!cancelled) Alert.alert('Hata', e?.message || 'Yüklenemedi')
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [projectId, scopeCtx, navigation, personel?.id, profile?.id, permissions, isSystemAdmin, reloadTick])

  const st = project ? getProjectStatusOption(project.durum) : null
  const accent = project?.renk || palette.primary[600]

  useEffect(() => {
    if (route.params?.refreshAt) {
      setReloadTick((t) => t + 1)
    }
  }, [route.params?.refreshAt])

  const openEditTask = useCallback(
    (task) => {
      if (!mayManage) return
      if (task?._operational_only && task.bagli_is_id) {
        navigation.navigate('TaskDetail', { taskId: task.bagli_is_id })
        return
      }
      navigation.navigate('ProjectTaskAssign', {
        projectId,
        editingTaskId: task?.id,
        mayLaunchOperational: mayAssignOperational,
      })
    },
    [mayManage, mayAssignOperational, navigation, projectId],
  )

  const openTask = useCallback(
    (task) => {
      if (task?.bagli_is_id) {
        navigation.navigate('TaskDetail', { taskId: task.bagli_is_id })
        return
      }
      if (mayManage) {
        openEditTask(task)
        return
      }
      Alert.alert(
        task?.baslik || 'Görev',
        'Bu planlama görevi henüz operasyonel göreve bağlanmamış.',
      )
    },
    [mayManage, navigation, openEditTask],
  )

  const openNewTask = useCallback(
    (parentId = null, assigneeId = null) => {
      if (!mayManage) {
        Alert.alert('Yetki', 'Proje yönetimi yetkiniz yok.')
        return
      }
      if (!teamMembers.length) {
        Alert.alert('Ekip gerekli', 'Önce proje ekibine sorumlu ekleyin.', [
          { text: 'Tamam' },
          {
            text: 'Projeyi düzenle',
            onPress: () => navigation.navigate('ProjectEdit', { projectId }),
          },
        ])
        return
      }
      if (mayAssignOperational && !parentId) {
        navigation.navigate('ExtraTask', {
          projeId: projectId,
          company: project?.ana_sirket_id,
          unitId: project?.birim_id,
          baslangic: project?.baslangic_tarihi?.slice?.(0, 10) || '',
          bitis: project?.bitis_tarihi?.slice?.(0, 10) || '',
          ...(assigneeId ? { personId: String(assigneeId) } : {}),
        })
        return
      }
      navigation.navigate('ProjectTaskAssign', {
        projectId,
        defaultParentId: parentId,
        defaultAssigneeId: assigneeId ? String(assigneeId) : null,
        mayLaunchOperational: mayAssignOperational,
      })
    },
    [mayManage, mayAssignOperational, teamMembers.length, navigation, projectId, project],
  )

  const launchOperational = useCallback(
    (task) => {
      if (!mayAssignOperational) {
        Alert.alert('Yetki', 'Görev atama yetkiniz yok.')
        return
      }
      navigation.navigate('ExtraTask', buildOperationalPrefillParams(task, { project, projectId }))
    },
    [mayAssignOperational, navigation, project, projectId],
  )

  const requestDeleteTask = useCallback(
    (taskId) => {
      const target = tasks.find((t) => String(t.id) === String(taskId))
      if (target?._operational_only) {
        Alert.alert(
          'Operasyonel görev',
          'Bu görev operasyonel kayıttır; silme işlemi görev detayından yapılır.',
        )
        return
      }
      Alert.alert('Görevi sil', 'Bu görev ve alt görevleri kaldırılır.', [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await softDeleteProjectTask(taskId)
              setReloadTick((t) => t + 1)
            } catch (e) {
              Alert.alert('Hata', e?.message || 'Silinemedi')
            }
          },
        },
      ])
    },
    [tasks],
  )

  const jumpToTasks = useCallback((quickFilter = 'all', mode = 'pending') => {
    setTasksQuickFilter(quickFilter)
    setTasksListMode(mode)
    setTab('gorevler')
  }, [])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    setReloadTick((t) => t + 1)
  }, [])

  const teamCount = teamMembers.length + authorizedMembers.length
  const tasksBottomPad = mayManage && tab === 'gorevler' ? spacing['3xl'] + 72 : spacing['3xl']

  if (loading && !project) {
    return (
      <AdminScreenLayout title="Proje">
        <ActivityIndicator size="large" color={palette.primary[500]} style={{ marginTop: 40 }} />
      </AdminScreenLayout>
    )
  }

  if (!project) return null

  return (
    <AdminScreenLayout
      title={project.baslik}
      subtitle={project.kod || birimLabel || undefined}
      scroll={false}
      padded={false}
      right={
        mayManage ? (
          <TouchableOpacity
            onPress={() => navigation.navigate('ProjectEdit', { projectId })}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Projeyi düzenle"
          >
            <Pencil size={22} color={palette.primary[700]} />
          </TouchableOpacity>
        ) : null
      }
    >
      <View style={[styles.tabBar, { backgroundColor: theme.pageBg }]}>
        <View style={[styles.tabInner, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
          {TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            const count = t.id === 'gorevler' ? progress.total : t.id === 'ekip' ? teamCount : null
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.tabBtn, active && { backgroundColor: accent }]}
                onPress={() => setTab(t.id)}
              >
                <Icon size={15} color={active ? '#fff' : palette.slate[500]} strokeWidth={2.2} />
                <Text variant="caption" weight="Bold" color={active ? '#fff' : palette.slate[600]}>
                  {t.label}
                </Text>
                {count != null && count > 0 ? (
                  <View style={[styles.tabCount, active && styles.tabCountActive]}>
                    <Text
                      variant="caption"
                      weight="Bold"
                      style={{ fontSize: 10, color: active ? '#fff' : palette.slate[600] }}
                    >
                      {count}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      <View style={[styles.content, { backgroundColor: theme.pageBg }]}>
        {tab === 'ozet' ? (
          <ProjectShowOverview
            project={project}
            statusOption={st}
            progress={progress}
            summary={summary}
            kpis={kpis}
            alerts={alerts}
            reportTasks={tasks}
            birimLabel={birimLabel}
            teamCount={teamCount}
            accent={accent}
            mayManage={mayManage}
            refreshing={refreshing}
            onRefresh={onRefresh}
            getAssigneeName={(task) => getProjectAssigneeName(task, personMap)}
            onJumpToTasks={jumpToTasks}
            onOpenTask={openTask}
            onGoTasks={() => setTab('gorevler')}
            onGoTeam={() => setTab('ekip')}
            onAssignTask={() => openNewTask()}
            onEditProject={() => navigation.navigate('ProjectEdit', { projectId })}
          />
        ) : null}

        {tab === 'gorevler' ? (
          <ProjectTasksTab
            tasks={tasks}
            personMap={personMap}
            personelId={personel?.id}
            projectLabel={project.baslik}
            listMode={tasksListMode}
            quickFilter={tasksQuickFilter}
            onListModeChange={setTasksListMode}
            onQuickFilterChange={setTasksQuickFilter}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onOpenTask={openTask}
            canManage={mayManage}
            onEditTask={openEditTask}
            onDeleteTask={requestDeleteTask}
            onLaunchOperational={mayAssignOperational ? launchOperational : undefined}
            bottomPad={tasksBottomPad}
          />
        ) : null}

        {tab === 'ekip' ? (
          <ScrollView
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.scrollPad}
            showsVerticalScrollIndicator={false}
          >
            <ProjectTeamCompactSection
              teamMembers={teamMembers}
              authorizedMembers={authorizedMembers}
              mayManage={mayManage}
              onEditPress={() => navigation.navigate('ProjectEdit', { projectId })}
            />
          </ScrollView>
        ) : null}
      </View>

      {tab === 'gorevler' && mayManage ? (
        <View style={[styles.fabWrap, { backgroundColor: theme.pageBg, borderTopColor: theme.border }]}>
          <Button
            variant="primary"
            size="md"
            fullWidth
            onPress={() => openNewTask()}
            iconLeft={<Plus size={18} color="#fff" />}
          >
            Görev ata
          </Button>
        </View>
      ) : null}
    </AdminScreenLayout>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  tabInner: {
    flexDirection: 'row',
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: radii.lg,
  },
  tabCount: {
    backgroundColor: palette.slate[100],
    borderRadius: radii.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabCountActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  content: {
    flex: 1,
  },
  scrollPad: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  fabWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
})
