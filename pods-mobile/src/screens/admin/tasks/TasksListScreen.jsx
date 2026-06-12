import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  SectionList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native'
import { useRoute, useNavigation } from '@react-navigation/native'
import { Search, SlidersHorizontal, Trash2 } from 'lucide-react-native'
import getSupabase from '../../../lib/supabaseClient'
import { useAuth } from '../../../contexts/AuthContext'
import { enrichTasksWithWorkActions } from '../../../lib/enrichTasksWorkActions'
import { useTabBarScrollPadding } from '../../../navigation/tabBarLayout'
import {
  enrichScopeForTasks,
  fetchPendingDeletionMap,
  loadTasksListData,
} from './lib/tasksListLoadUtils'
import {
  filterByListMode,
  groupCompletedByTime,
  groupPendingByTime,
  matchesQuickFilter,
  filterQuickFiltersForAssignPermission,
  normalizeQuickFilterForAssignPermission,
} from './lib/tasksListGrouping'
import { getTaskTypeLabel } from './lib/taskTypeLabels'
import {
  enrichScopeWithJunctionPersonelIds,
  isUnitInScope,
  scopeAnaSirketlerQuery,
  scopeBirimlerQuery,
  scopeIslerQuery,
  scopePersonelQuery,
  TASKS_LIST_LIMIT,
} from '../../../lib/supabaseScope'
import {
  getTaskVisibleAt,
  isTaskVisibilityInstantInFuture,
  isTaskVisibleToPerson,
  isListedTaskVisibleForAssignee,
} from '../../../lib/taskVisibility'
import { formatFullName } from '../../../lib/nameFormat'
import { taskOperationalEditEligible } from '../../../lib/taskStatus'
import {
  canOperationallyEditAssignedTask,
  canRequestTaskDeletion,
  canAssignTask,
} from '../../../lib/permissions'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import TaskListCard from './components/TaskListCard'
import TasksFiltersOffcanvas from './components/TasksFiltersOffcanvas'
import TasksListModeSwitch from './components/TasksListModeSwitch'
import { TaskListSectionHeader, SECTION_COLORS } from './components/TaskListSectionHeader'
import { TASK_LIST_BRAND } from './lib/tasksListTheme'
import { TASKS_STACK_SCREENS, resolveTasksListMode } from '../../../lib/mobileAdminNav'
import {
  Text,
  SkeletonCard,
  Button,
  Heading,
  palette,
  spacing,
  radii,
  cubicle,
} from '../../../ui'

const supabase = getSupabase()

const PAGE_CONFIG = {
  pending: {
    title: 'Bekleyen görevler',
    quickFilters: [
      { id: 'all', label: 'Tümü' },
      { id: 'assigned_to_me', label: 'Bana atanan' },
      { id: 'assigned_by_me', label: 'Benim atadığım' },
      { id: 'urgent', label: 'Acil' },
    ],
    defaultQuickFilter: 'all',
  },
  completed: {
    title: 'Tamamlanan görevler',
    quickFilters: [
      { id: 'all', label: 'Tümü' },
      { id: 'assigned_to_me', label: 'Bana atanan' },
      { id: 'assigned_by_me', label: 'Benim atadığım' },
      { id: 'urgent', label: 'Acil' },
    ],
    defaultQuickFilter: 'all',
  },
  upcoming: {
    title: 'Yaklaşan görevler',
    quickFilters: [
      { id: 'assigned_to_me', label: 'Bana atanan' },
      { id: 'assigned_by_me', label: 'Benim atadığım' },
      { id: 'urgent', label: 'Acil' },
    ],
    defaultQuickFilter: 'assigned_to_me',
  },
}

const JOBS_SELECT_WITH_VISIBLE_AT =
  'id,baslik,durum,aciklama,baslama_tarihi,son_tarih,created_at,updated_at,gorunur_tarih,ana_sirket_id,birim_id,sorumlu_personel_id,atayan_personel_id,is_sablon_id,gorev_turu,ozel_gorev,acil'

const JOBS_SELECT_LEGACY =
  'id,baslik,durum,aciklama,baslama_tarihi,son_tarih,created_at,updated_at,ana_sirket_id,birim_id,sorumlu_personel_id,atayan_personel_id,is_sablon_id,gorev_turu,ozel_gorev,acil'

const UPCOMING_FETCH_LIMIT = 900

function QuickFilterPill({ label, active, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.quickPill, active && styles.quickPillActive]}
    >
      <Text
        variant="caption"
        weight="Bold"
        color={active ? palette.surface : palette.slate[700]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  )
}

function buildDefaultOpenMap(sections) {
  const map = {}
  for (const s of sections || []) {
    map[s.key] = (s.tasks?.length ?? 0) > 0
  }
  return map
}

async function loadUpcomingTasks({ scope, personel, isSystemAdmin, currentCompanyId }) {
  const nowIso = new Date().toISOString()
  const orWithGorunur = `baslama_tarihi.gt.${nowIso},gorunur_tarih.gt.${nowIso},created_at.gt.${nowIso}`
  const orLegacy = `baslama_tarihi.gt.${nowIso},created_at.gt.${nowIso}`

  const [
    { data: comps, error: compErr },
    { data: unitsData, error: unitsErr },
    { data: staffData, error: staffErr },
  ] = await Promise.all([
    scopeAnaSirketlerQuery(
      supabase.from('ana_sirketler').select('id,ana_sirket_adi').is('silindi_at', null),
      scope,
    ),
    scopeBirimlerQuery(
      supabase.from('birimler').select('id,birim_adi,ana_sirket_id').is('silindi_at', null),
      scope,
    ),
    scopePersonelQuery(
      supabase.from('personeller').select('id,ad,soyad,email').is('silindi_at', null),
      scope,
    ),
  ])

  let usedLegacySelect = false
  let jobsQuery = supabase
    .from('isler')
    .select(JOBS_SELECT_WITH_VISIBLE_AT)
    .or(orWithGorunur)
    .order('baslama_tarihi', { ascending: true })
    .limit(UPCOMING_FETCH_LIMIT)

  let jobsRes = await scopeIslerQuery(jobsQuery, scope)
  let { data: jobs, error: jobsErr } = jobsRes

  if (jobsErr?.code === '42703') {
    usedLegacySelect = true
    jobsQuery = supabase
      .from('isler')
      .select(JOBS_SELECT_LEGACY)
      .or(orLegacy)
      .order('baslama_tarihi', { ascending: true })
      .limit(UPCOMING_FETCH_LIMIT)
    jobsRes = await scopeIslerQuery(jobsQuery, scope)
    jobs = jobsRes.data
    jobsErr = jobsRes.error
  }

  if (!jobsErr && personel?.id && currentCompanyId) {
    try {
      const sel = usedLegacySelect ? JOBS_SELECT_LEGACY : JOBS_SELECT_WITH_VISIBLE_AT
      const orActive = usedLegacySelect ? orLegacy : orWithGorunur
      const { data: privateAssignedByMe, error: privateErr } = await supabase
        .from('isler')
        .select(sel)
        .eq('ana_sirket_id', currentCompanyId)
        .eq('atayan_personel_id', personel.id)
        .eq('ozel_gorev', true)
        .or(orActive)
        .order('created_at', { ascending: false })
        .limit(TASKS_LIST_LIMIT)

      if (!privateErr && Array.isArray(privateAssignedByMe) && privateAssignedByMe.length) {
        const mergedMap = new Map()
        for (const row of jobs || []) mergedMap.set(String(row?.id || ''), row)
        for (const row of privateAssignedByMe) mergedMap.set(String(row?.id || ''), row)
        jobs = Array.from(mergedMap.values())
      }
    } catch {
      /* best-effort */
    }
  }

  if (compErr || staffErr || jobsErr || unitsErr) {
    return {
      error: compErr || staffErr || jobsErr || unitsErr,
      tasks: [],
      companies: [],
      units: [],
      staff: [],
    }
  }

  const now = new Date()
  const upcoming = (jobs || []).filter(
    (t) => isTaskVisibilityInstantInFuture(t, now) && isTaskVisibleToPerson(t, personel?.id),
  )
  upcoming.sort((a, b) => {
    const ta = new Date(getTaskVisibleAt(a) || 0).getTime()
    const tb = new Date(getTaskVisibleAt(b) || 0).getTime()
    return ta - tb
  })

  return {
    error: null,
    tasks: upcoming,
    companies: comps || [],
    units: unitsData || [],
    staff: staffData || [],
  }
}

export default function TasksListScreen() {
  const route = useRoute()
  const navigation = useNavigation()
  const [listMode, setListMode] = useState(() => resolveTasksListMode(route))
  const config = PAGE_CONFIG[listMode] || PAGE_CONFIG.pending
  const canSwitchMode = listMode === 'pending' || listMode === 'completed'
  const screenTitle = canSwitchMode ? 'Görevler' : config.title

  useEffect(() => {
    const next = route.params?.listMode
    if (next === 'pending' || next === 'completed' || next === 'upcoming') {
      setListMode(next)
    }
  }, [route.params?.listMode])

  const { personel, scopeReady, permissions, profile } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const canAssign = canAssignTask(permissions, isSystemAdmin, personel)
  const quickFilters = useMemo(
    () => filterQuickFiltersForAssignPermission(config.quickFilters, canAssign),
    [config.quickFilters, canAssign],
  )
  const canSubmitDeletion = canRequestTaskDeletion(permissions)
  const canOpEdit = isSystemAdmin || canOperationallyEditAssignedTask(permissions, false)
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIdsRaw = isSystemAdmin ? [] : personel?.accessibleUnitIds
  const accessibleUnitIds = isSystemAdmin
    ? null
    : Array.isArray(accessibleUnitIdsRaw)
      ? accessibleUnitIdsRaw
      : null
  const localScopeReady = isSystemAdmin
    ? true
    : Boolean(currentCompanyId) && Array.isArray(accessibleUnitIdsRaw)
  const canLoadWithScope = Boolean(scopeReady) && localScopeReady
  const companyScoped = !isSystemAdmin && !!currentCompanyId
  const isInTasksStack = TASKS_STACK_SCREENS.has(route.name)
  const showBackButton = isInTasksStack ? navigation.canGoBack() : true
  const tabBarPad = useTabBarScrollPadding(spacing.md)

  const [tasks, setTasks] = useState([])
  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState(config.defaultQuickFilter || 'all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedTaskType, setSelectedTaskType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedUnitIds, setSelectedUnitIds] = useState([])
  const [openSectionKeys, setOpenSectionKeys] = useState({})
  const [pendingDeletionByIsId, setPendingDeletionByIsId] = useState({})
  const [actionBusy, setActionBusy] = useState(null)
  const [deleteModal, setDeleteModal] = useState(null)
  const [deleteReason, setDeleteReason] = useState('')
  const hasLoadedRef = useRef(false)
  const enrichGenRef = useRef(0)

  useEffect(() => {
    setQuickFilter(
      normalizeQuickFilterForAssignPermission(
        config.defaultQuickFilter || 'all',
        canAssign,
        'all',
      ),
    )
  }, [listMode, config.defaultQuickFilter, canAssign])

  useEffect(() => {
    setQuickFilter((prev) => normalizeQuickFilterForAssignPermission(prev, canAssign, 'all'))
  }, [canAssign])

  useEffect(() => {
    if (companyScoped && currentCompanyId) {
      setSelectedCompanyId(String(currentCompanyId))
    }
  }, [companyScoped, currentCompanyId])

  const staffNameById = useMemo(() => {
    const map = {}
    for (const s of staff || []) {
      map[String(s.id)] = formatFullName(s.ad, s.soyad, '') || s.email || '-'
    }
    return map
  }, [staff])

  const companyNameById = useMemo(() => {
    const map = {}
    for (const c of companies || []) {
      map[String(c.id)] = c.ana_sirket_adi || '-'
    }
    return map
  }, [companies])

  const getCompanyName = useCallback(
    (id) => (id ? companyNameById[String(id)] || '-' : '-'),
    [companyNameById],
  )
  const getTaskContextLabel = useCallback(
    (task) => task?._projectTitle || task?.projectLabel || getCompanyName(task?.ana_sirket_id),
    [getCompanyName],
  )
  const getStaffName = useCallback(
    (id) => (id ? staffNameById[String(id)] || '-' : '-'),
    [staffNameById],
  )

  const modeCounts = useMemo(() => {
    let pending = 0
    let completed = 0
    for (const t of tasks || []) {
      if (filterByListMode(t, 'completed')) completed += 1
      else if (filterByListMode(t, 'pending')) pending += 1
    }
    return { pending, completed }
  }, [tasks])

  const taskTypeOptions = useMemo(
    () =>
      Array.from(
        new Set([
          'normal',
          'sablon_gorev',
          'zincir_gorev',
          'zincir_onay',
          'zincir_gorev_ve_onay',
          'sirali_gorev',
          ...tasks.map((t) => String(t?.gorev_turu || '').trim()).filter(Boolean),
        ]),
      ).sort((a, b) => getTaskTypeLabel(a).localeCompare(getTaskTypeLabel(b), 'tr')),
    [tasks],
  )

  const availableUnitOptions = useMemo(
    () =>
      (units || []).filter((u) => {
        if (!u?.id) return false
        if (companyScoped) return true
        if (!selectedCompanyId) return true
        return String(u.ana_sirket_id) === String(selectedCompanyId)
      }),
    [units, companyScoped, selectedCompanyId],
  )

  const toggleUnitSelection = useCallback((unitId) => {
    const id = String(unitId)
    setSelectedUnitIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    )
  }, [])

  const load = useCallback(async () => {
    if (!canLoadWithScope) return
    if (!hasLoadedRef.current) setLoading(true)
    const enrichGen = enrichGenRef.current + 1
    enrichGenRef.current = enrichGen
    try {
      const scope = await enrichScopeWithJunctionPersonelIds(supabase, {
        isSystemAdmin,
        currentCompanyId,
        accessibleUnitIds,
      })

      let result
      if (listMode === 'upcoming') {
        result = await loadUpcomingTasks({ scope, personel, isSystemAdmin, currentCompanyId })
      } else {
        const enrichedScope = await enrichScopeForTasks(supabase, {
          isSystemAdmin,
          currentCompanyId,
          accessibleUnitIds,
        })
        result = await loadTasksListData({
          supabase,
          scope: enrichedScope,
          personel,
          isSystemAdmin,
          currentCompanyId,
          operatorMode: false,
        })
      }

      if (result.error) {
        Alert.alert('Hata', result.error?.message || 'Görevler yüklenemedi')
        setTasks([])
      } else {
        setCompanies(result.companies || [])
        setUnits(result.units || [])
        setStaff(result.staff || [])
        let nextTasks = result.tasks || []
        if (nextTasks.length && personel?.id && listMode !== 'upcoming') {
          try {
            nextTasks = await enrichTasksWithWorkActions(supabase, nextTasks, personel.id)
          } catch {
            /* best-effort */
          }
        }
        if (enrichGenRef.current === enrichGen) {
          setTasks(nextTasks)
          hasLoadedRef.current = true
        }
      }
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Görevler yüklenemedi')
      setTasks([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [canLoadWithScope, listMode, isSystemAdmin, currentCompanyId, accessibleUnitIds, personel])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    if (!tasks.length) {
      setPendingDeletionByIsId({})
      return undefined
    }
    const ids = tasks.map((t) => t.id).filter(Boolean)
    ;(async () => {
      try {
        const map = await fetchPendingDeletionMap(supabase, ids)
        if (!cancelled) setPendingDeletionByIsId(map)
      } catch {
        if (!cancelled) setPendingDeletionByIsId({})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tasks])

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim()
    const now = new Date()
    return (tasks || []).filter((t) => {
      if (listMode !== 'upcoming' && !filterByListMode(t, listMode)) return false
      if (!matchesQuickFilter(t, quickFilter, personel?.id)) return false
      if (listMode === 'upcoming' && !isListedTaskVisibleForAssignee(t, now)) return false

      const title = String(t.baslik || '').toLowerCase()
      const company = getTaskContextLabel(t).toLowerCase()
      const staffName = getStaffName(t.sorumlu_personel_id).toLowerCase()
      const matchesSearch = !term
        ? true
        : companyScoped
          ? title.includes(term) || staffName.includes(term)
          : title.includes(term) || company.includes(term) || staffName.includes(term)

      const matchesCompany = companyScoped
        ? String(t.ana_sirket_id) === String(currentCompanyId)
        : selectedCompanyId
          ? String(t.ana_sirket_id) === String(selectedCompanyId)
          : true

      const matchesTaskType = selectedTaskType
        ? selectedTaskType === 'sablon_gorev'
          ? !!t.is_sablon_id
          : String(t.gorev_turu || '').trim() === selectedTaskType
        : true

      const matchesUnit = selectedUnitIds.length
        ? selectedUnitIds.includes(String(t.birim_id || ''))
        : true

      const taskPointTimes = [t.baslama_tarihi, t.son_tarih, t.created_at, t.updated_at]
        .map((v) => {
          if (!v) return null
          const d = new Date(v)
          return Number.isNaN(d.getTime()) ? null : d.getTime()
        })
        .filter(Boolean)
      const startMs = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null
      const endMs = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : null
      const matchesDate =
        !startMs && !endMs
          ? true
          : taskPointTimes.some((pt) => {
              if (startMs != null && pt < startMs) return false
              if (endMs != null && pt > endMs) return false
              return true
            })

      return (
        matchesSearch &&
        matchesCompany &&
        matchesTaskType &&
        matchesUnit &&
        matchesDate
      )
    })
  }, [
    tasks,
    listMode,
    quickFilter,
    personel?.id,
    search,
    companyScoped,
    currentCompanyId,
    selectedCompanyId,
    selectedTaskType,
    selectedUnitIds,
    startDate,
    endDate,
    getStaffName,
    getTaskContextLabel,
  ])

  const timeSections = useMemo(() => {
    if (listMode === 'pending') {
      const { today, tomorrow, week } = groupPendingByTime(filtered)
      return [
        {
          key: 'today',
          label: 'Bugün',
          subtitle: 'Gecikmiş ve bugün bitenler',
          tasks: today,
          emptyText: 'Bugün için görev yok.',
        },
        {
          key: 'tomorrow',
          label: 'Yarın',
          subtitle: 'Yarın biten görevler',
          tasks: tomorrow,
          emptyText: 'Yarın için görev yok.',
        },
        {
          key: 'week',
          label: '7 Gün',
          subtitle: '2–7 gün içinde bitenler',
          tasks: week,
          emptyText: 'Önümüzdeki 7 gün içinde görev yok.',
        },
      ]
    }
    if (listMode === 'completed') {
      const { today, yesterday, last7Days } = groupCompletedByTime(filtered)
      return [
        {
          key: 'today',
          label: 'Bugün',
          subtitle: 'Bugün tamamlananlar',
          tasks: today,
          emptyText: 'Bugün tamamlanan görev yok.',
        },
        {
          key: 'yesterday',
          label: 'Dün',
          subtitle: 'Dün tamamlananlar',
          tasks: yesterday,
          emptyText: 'Dün tamamlanan görev yok.',
        },
        {
          key: 'last7',
          label: 'Son 7 gün',
          subtitle: 'Dünden önceki tamamlananlar',
          tasks: last7Days,
          emptyText: 'Bu aralıkta tamamlanan görev yok.',
        },
      ]
    }
    return []
  }, [listMode, filtered])

  useEffect(() => {
    setOpenSectionKeys(buildDefaultOpenMap(timeSections))
  }, [timeSections, listMode])

  const sectionListData = useMemo(
    () =>
      timeSections.map((section) => ({
        ...section,
        data:
          openSectionKeys[section.key] !== false
            ? section.tasks?.length
              ? section.tasks
              : [{ id: `__empty_${section.key}`, __sectionEmpty: true, emptyText: section.emptyText }]
            : [],
      })),
    [timeSections, openSectionKeys],
  )

  const hasNoTasks =
    !loading &&
    (listMode === 'upcoming'
      ? filtered.length === 0
      : timeSections.length > 0 && timeSections.every((s) => s.tasks.length === 0))

  const advancedFilterCount =
    (selectedTaskType ? 1 : 0) +
    (startDate ? 1 : 0) +
    (endDate ? 1 : 0) +
    (selectedUnitIds.length ? 1 : 0) +
    (!companyScoped && selectedCompanyId ? 1 : 0)

  const getCardActions = useCallback(
    (task) => {
      const scopeOk = !accessibleUnitIds?.length || isUnitInScope(accessibleUnitIds, task?.birim_id)
      const deletionPending = !!pendingDeletionByIsId[String(task?.id)]
      return {
        showDelete: canSubmitDeletion && scopeOk && !deletionPending,
        showEdit: canOpEdit && scopeOk && taskOperationalEditEligible(task) && !deletionPending,
        deletionPending,
      }
    },
    [accessibleUnitIds, pendingDeletionByIsId, canSubmitDeletion, canOpEdit],
  )

  const executeDeletionRequest = useCallback(
    async (task, talepAciklama) => {
      if (!task?.id || !canSubmitDeletion) return
      const aciklama = String(talepAciklama || '').trim()
      if (!aciklama) {
        Alert.alert('Eksik bilgi', 'Silme nedeni zorunludur')
        return
      }
      setActionBusy(task.id)
      try {
        const { error } = await supabase.rpc('rpc_is_silme_talebi_olustur', {
          p_is_id: task.id,
          p_aciklama: aciklama,
        })
        if (error) throw error
        Alert.alert('Tamam', 'Silme talebi onaya gönderildi')
        await load()
      } catch (e) {
        Alert.alert('Hata', e?.message || 'Silme talebi oluşturulamadı')
      } finally {
        setActionBusy(null)
      }
    },
    [canSubmitDeletion, load],
  )

  const renderCard = useCallback(
    (task) => {
      const actions = getCardActions(task)
      const busy = actionBusy === task.id
      return (
        <TaskListCard
          task={task}
          assignerName={getStaffName(task.atayan_personel_id)}
          showEdit={actions.showEdit}
          showDelete={actions.showDelete}
          deletionPending={actions.deletionPending}
          actionBusy={busy}
          onDetail={() => navigation.navigate('TaskDetail', { taskId: task.id })}
          onEdit={() => navigation.navigate('TaskOperationalEdit', { taskId: task.id })}
          onDelete={() => {
            setDeleteReason('')
            setDeleteModal(task)
          }}
        />
      )
    },
    [navigation, getStaffName, getCardActions, actionBusy],
  )

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    load()
  }, [load])

  const clearAdvancedFilters = useCallback(() => {
    setSelectedTaskType('')
    setStartDate('')
    setEndDate('')
    setSelectedUnitIds([])
    if (!companyScoped) setSelectedCompanyId('')
  }, [companyScoped])

  const handleModeSwitch = useCallback(
    (mode) => {
      if (mode === listMode || (mode !== 'pending' && mode !== 'completed')) return
      setListMode(mode)
      navigation.setParams({ listMode: mode })
    },
    [listMode, navigation],
  )

  const toggleSection = useCallback((key) => {
    setOpenSectionKeys((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const listHeader = useMemo(
    () => (
      <View style={styles.listHeader}>
        {canSwitchMode ? (
          <TasksListModeSwitch
            mode={listMode}
            onChange={handleModeSwitch}
            pendingCount={modeCounts.pending}
            completedCount={modeCounts.completed}
          />
        ) : null}

        <View style={styles.toolbar}>
          <View style={styles.searchRow}>
            <View style={styles.searchWrap}>
              <Search
                size={18}
                color={palette.slate[500]}
                style={styles.searchIcon}
                strokeWidth={2}
              />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Görev veya kişi ara…"
                placeholderTextColor={palette.slate[400]}
                style={styles.searchInput}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>
            <TouchableOpacity
              style={styles.filterBtn}
              activeOpacity={0.85}
              onPress={() => setFiltersOpen(true)}
              accessibilityLabel="Filtreler"
            >
              <SlidersHorizontal size={20} color={palette.surface} strokeWidth={2} />
              {advancedFilterCount > 0 ? (
                <View style={styles.filterBadge}>
                  <Text variant="caption" weight="Bold" color={palette.surface}>
                    {advancedFilterCount}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickScroll}
            style={styles.quickScrollWrap}
          >
            {quickFilters.map((f) => (
              <QuickFilterPill
                key={f.id}
                label={f.label}
                active={quickFilter === f.id}
                onPress={() => setQuickFilter(f.id)}
              />
            ))}
          </ScrollView>

          {!loading && filtered.length > 0 ? (
            <View style={styles.summaryChip}>
              <Text variant="caption" weight="Bold" color={palette.slate[700]}>
                {filtered.length} görev
                {quickFilter !== 'all' ? ' · filtreli' : ''}
              </Text>
            </View>
          ) : null}
        </View>

        {loading ? (
          <ActivityIndicator color={palette.primary[500]} style={{ marginVertical: spacing.lg }} />
        ) : null}

        {hasNoTasks && !loading ? (
          <View style={styles.emptyBox}>
            <Text variant="bodyMd" weight="SemiBold" color={palette.slate[700]}>
              {listMode === 'completed' ? 'Tamamlanan görev yok' : listMode === 'upcoming' ? 'Yaklaşan görev yok' : 'Bekleyen görev yok'}
            </Text>
            <Text variant="bodySm" color={palette.slate[500]} style={{ marginTop: 4, textAlign: 'center' }}>
              Filtreleri temizleyerek veya aramayı sıfırlayarak tekrar deneyin.
            </Text>
          </View>
        ) : null}
      </View>
    ),
    [
      canSwitchMode,
      listMode,
      handleModeSwitch,
      modeCounts,
      loading,
      filtered.length,
      quickFilter,
      quickFilters,
      search,
      advancedFilterCount,
      hasNoTasks,
    ],
  )

  if (loading && !hasLoadedRef.current) {
    return (
      <AdminScreenLayout title={screenTitle} showBack={showBackButton}>
        <SkeletonCard />
        <SkeletonCard />
      </AdminScreenLayout>
    )
  }

  return (
    <AdminScreenLayout title={screenTitle} showBack={showBackButton}>
      {listMode === 'upcoming' ? (
        <SectionList
          sections={[{ key: 'all', data: filtered }]}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <View style={styles.cardWrap}>{renderCard(item)}</View>}
          ListHeaderComponent={listHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: isInTasksStack ? tabBarPad : spacing['3xl'] }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary[500]} />
          }
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            !loading && !filtered.length ? (
              <Text variant="bodySm" color={palette.slate[500]} style={styles.emptyCenter}>
                Yaklaşan görev bulunamadı.
              </Text>
            ) : null
          }
        />
      ) : (
        <SectionList
          sections={sectionListData}
          keyExtractor={(item, index) =>
            item.__sectionEmpty ? `empty-${index}` : String(item.id ?? index)
          }
          renderSectionHeader={({ section }) => (
            <TaskListSectionHeader
              label={section.label}
              count={section.tasks?.length ?? 0}
              color={SECTION_COLORS[section.key] || cubicle.todayBar}
              open={openSectionKeys[section.key] !== false}
              subtitle={section.subtitle}
              onToggle={() => toggleSection(section.key)}
            />
          )}
          renderItem={({ item }) =>
            item.__sectionEmpty ? (
              <Text variant="caption" color={palette.slate[500]} style={styles.sectionEmpty}>
                {item.emptyText}
              </Text>
            ) : (
              <View style={styles.cardWrap}>{renderCard(item)}</View>
            )
          }
          ListHeaderComponent={listHeader}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: isInTasksStack ? tabBarPad : spacing['3xl'] }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary[500]} />
          }
          keyboardShouldPersistTaps="handled"
          SectionSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}

      <TasksFiltersOffcanvas
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        companyScoped={companyScoped}
        companies={companies}
        currentCompanyId={currentCompanyId}
        selectedCompanyId={selectedCompanyId}
        onCompanyChange={(v) => {
          setSelectedCompanyId(v)
          setSelectedUnitIds([])
        }}
        selectedTaskType={selectedTaskType}
        onTaskTypeChange={setSelectedTaskType}
        taskTypeOptions={taskTypeOptions}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        availableUnitOptions={availableUnitOptions}
        selectedUnitIds={selectedUnitIds}
        onToggleUnit={toggleUnitSelection}
        onClear={clearAdvancedFilters}
      />

      <Modal
        visible={!!deleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModal(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setDeleteModal(null)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconWrap}>
                <Trash2 size={20} color="#C2410C" strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Heading variant="h3" color={palette.slate[800]}>
                  Silme nedeni
                </Heading>
                <Text variant="bodySm" color={palette.slate[500]} style={{ marginTop: 2 }}>
                  Onay sonrası görev kalıcı olarak silinir
                </Text>
              </View>
            </View>
            <TextInput
              style={styles.modalInput}
              multiline
              value={deleteReason}
              onChangeText={setDeleteReason}
              placeholder="Silme gerekçesini yazın…"
              placeholderTextColor={palette.slate[400]}
            />
            <View style={styles.modalActions}>
              <Button
                variant="outline"
                size="md"
                style={{ flex: 1 }}
                onPress={() => {
                  setDeleteModal(null)
                  setDeleteReason('')
                }}
              >
                İptal
              </Button>
              <Button
                variant="primary"
                size="md"
                style={{ flex: 1, backgroundColor: '#EA580C' }}
                onPress={() => {
                  const text = deleteReason.trim()
                  if (!text) {
                    Alert.alert('Eksik bilgi', 'Silme nedeni zorunludur')
                    return
                  }
                  const task = deleteModal
                  setDeleteModal(null)
                  setDeleteReason('')
                  if (task) void executeDeletionRequest(task, text)
                }}
              >
                Onaya gönder
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </AdminScreenLayout>
  )
}

const styles = StyleSheet.create({
  listHeader: {
    paddingBottom: spacing.xs,
  },
  toolbar: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  quickScrollWrap: {
    flexGrow: 0,
    marginHorizontal: -2,
  },
  quickScroll: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  quickPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: palette.slate[100],
    minHeight: 36,
    justifyContent: 'center',
  },
  quickPillActive: {
    backgroundColor: TASK_LIST_BRAND,
  },
  summaryChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: palette.slate[100],
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii['2xl'],
    backgroundColor: palette.slate[100],
    paddingHorizontal: spacing.md,
    minHeight: 50,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    color: palette.slate[900],
    paddingVertical: spacing.sm,
    backgroundColor: 'transparent',
  },
  filterBtn: {
    width: 50,
    height: 50,
    borderRadius: radii['2xl'],
    backgroundColor: TASK_LIST_BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.danger[500],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cardWrap: {
    marginBottom: 2,
  },
  sectionEmpty: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: palette.slate[50],
    borderRadius: radii.xl,
    marginBottom: spacing.md,
  },
  emptyCenter: {
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    padding: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  modalIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: palette.slate[200],
    borderRadius: radii.lg,
    padding: spacing.md,
    fontSize: 16,
    color: palette.slate[800],
    textAlignVertical: 'top',
    marginBottom: spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
})
