import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  RefreshControl,
  Alert,
  Platform,
  Image,
  TextInput,
  InteractionManager,
  Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import Svg, { Polyline } from 'react-native-svg'
import getSupabase from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import Theme from '../../theme/theme'
import {
  canCreateTasks,
  canAssignTasks,
  hasManagementPrivileges,
  isPermTruthy as isPermTruthyShared,
  isTopCompanyScope as isTopCompanyScopeShared,
} from '../../lib/managementScope'
import { hasWebPanelAccess, canManageStaff } from '../../lib/permissions'
import { navigateMobileRoute } from '../../lib/mobileAdminNav'
import { formatFullName } from '../../lib/nameFormat'
import { DEFAULT_AVATAR_ID } from '../../lib/avatarTemplates'
import { loadAvatarPreference } from '../../lib/avatarPreference'
import { normalizeTaskScore, recordTaskPenaltyOnce } from '../../lib/pointsLedger'
import {
  TASK_STATUS,
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
  normalizeTaskStatus,
} from '../../lib/taskStatus'
import { shallowCloneRows } from '../../lib/shallowCloneRows'
import {
  LIVE_FIELD_AUDIT_TASK_STATUSES,
  fetchManagerLiveFieldAuditTasks,
  fetchManagerFocusApprovalHead,
  attachChainGorevPhotosToRows,
  attachChainGorevVideosToRows,
  liveAuditShouldOpenDenetim,
  extractKanitPhotoUrls,
  getFirstVideoEvidenceUrlFromJob,
} from '../../lib/liveFieldAuditFeed'
import {
  CUBICLE_REPORT_SCOPE_DEFAULT,
  filterCubicleHomeUrgentTodayTasks,
} from '../../lib/cubicleHomeTaskBuckets'
import { computeManagerHomeKpis } from '../../lib/managerHomeKpis'
import HomeCompactGreeting from '../../components/home/HomeCompactGreeting'
import HomeTopBar from '../../components/home/HomeTopBar'
import ManagerHomeKpiStrip from '../../components/home/ManagerHomeKpiStrip'
import ManagerOperasyonOzeti from '../../components/home/ManagerOperasyonOzeti'
import LiveTaskFlowPanel from '../../components/home/LiveTaskFlowPanel'
import OperatorHomeSections from '../../components/home/OperatorHomeSections'
import UrgentTasksPanel from '../../components/cubicle/UrgentTasksPanel'
import { useTaskNotifications } from '../../hooks/useTaskNotifications'
import { useTabBarScrollPadding } from '../../navigation/tabBarLayout'
import {
  restrictQueryByPersonelBirimHierarchy,
  restrictBirimlerQueryByHierarchy,
  restrictAnnouncementQueryByTargetUnits,
} from '../../lib/supabaseScope'
import {
  Screen as KitScreen,
  Card as KitCard,
  Section as KitSection,
  Button as KitButton,
  IconButton as KitIconButton,
  Chip as KitChip,
  StatusBadge as KitStatusBadge,
  IconBubble as KitIconBubble,
  MetricCard as KitMetricCard,
  EmptyState as KitEmptyState,
  Sheet as KitSheet,
  CenterModal as KitCenterModal,
  Heading as KitHeading,
  Text as KitText,
  palette as kitPalette,
  spacing as kitSpacing,
  radii as kitRadii,
  shadows as kitShadows,
  tones as kitTones,
  Icon,
  mapWeatherIcon,
} from '../../ui'

const supabase = getSupabase()

const ThemeObj = Theme?.default ?? Theme
const { Colors, Layout, Typography, Spacing, Radii } = ThemeObj

const CORPORATE_NAVY = Colors.text
const SUCCESS_GREEN = Colors.success
const MUTED = Colors.mutedText

const DAILY_TARGET_POINTS = 3000
const RING_SIZE = 64
const DATE_FILTER_TODAY = 'today'
const DATE_FILTER_THIS_WEEK = 'this_week'
const DATE_FILTER_THIS_MONTH = 'this_month'
const DATE_FILTER_LAST_MONTH = 'last_month'
const DATE_FILTER_LAST_3_MONTHS = 'last_3_months'

function isCompleted(durum) {
  return isApprovedTaskStatus(durum)
}

/**
 * Türkçe diacritic-strip + lowercase normalize. Eski Home.js'te tanımsız
 * kalmış bir referansın güvenli karşılığı (orijinalde sadece personel
 * gecikme cezası akışında çağırılıyor).
 */
function normalizeDurum(v) {
  return String(v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function getFirstPhotoUrl(job) {
  return extractKanitPhotoUrls(job)[0] ?? null
}

function mapAuditStatusMeta(durum) {
  const status = normalizeTaskStatus(durum)
  if (status === TASK_STATUS.PENDING_APPROVAL) return { label: TASK_STATUS.PENDING_APPROVAL, color: 'pending' }
  if (status === TASK_STATUS.RESUBMITTED) return { label: TASK_STATUS.RESUBMITTED, color: 'accent' }
  if (status === TASK_STATUS.APPROVED) return { label: TASK_STATUS.APPROVED, color: 'success' }
  if (status === TASK_STATUS.REJECTED) return { label: TASK_STATUS.REJECTED, color: 'rejected' }
  if (status === TASK_STATUS.ASSIGNED) return { label: TASK_STATUS.ASSIGNED, color: 'pending' }
  return { label: String(status || durum || 'Durum'), color: 'pending' }
}

function mapRecentStatusMeta(durum) {
  const status = normalizeTaskStatus(durum)
  if (status === TASK_STATUS.PENDING_APPROVAL || status === TASK_STATUS.RESUBMITTED) {
    return { label: status, tone: 'pending' }
  }
  if (status === TASK_STATUS.REJECTED) return { label: TASK_STATUS.REJECTED, tone: 'rejected' }
  if (status === TASK_STATUS.APPROVED) return { label: TASK_STATUS.APPROVED, tone: 'approved' }
  if (status === TASK_STATUS.ASSIGNED) return { label: TASK_STATUS.ASSIGNED, tone: 'pending' }
  return { label: String(status || durum || 'Durum'), tone: 'pending' }
}

function mapGorevTuruBadge(gorevTuru) {
  const t = String(gorevTuru || '').toLowerCase()
  if (t === 'zincir_gorev') return { Icon: Icon.Chain, label: 'Zincir Görev' }
  if (t === 'zincir_onay') return { Icon: Icon.TaskComplete, label: 'Zincir Onay' }
  if (t === 'zincir_gorev_ve_onay') return { Icon: Icon.Chain, label: 'Zincir Görev + Zincir Onay' }
  return null
}

function getTodayDateString() {
  return new Date().toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function getTodayRangeForQuery() {
  const d = new Date()
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const nextDay = new Date(d)
  nextDay.setDate(nextDay.getDate() + 1)
  const y2 = nextDay.getFullYear()
  const mo2 = String(nextDay.getMonth() + 1).padStart(2, '0')
  const day2 = String(nextDay.getDate()).padStart(2, '0')
  return {
    start: `${y}-${mo}-${day}T00:00:00`,
    end: `${y2}-${mo2}-${day2}T00:00:00`,
  }
}

function getRangeForFilter(filter) {
  const now = new Date()
  if (filter === DATE_FILTER_TODAY) {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return { startIso: start.toISOString(), endIso: end.toISOString() }
  }
  if (filter === DATE_FILTER_THIS_WEEK) {
    // Basit pencere: bugünden geriye 6 gün + yarın 00:00
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - 6)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    return { startIso: start.toISOString(), endIso: end.toISOString() }
  }
  if (filter === DATE_FILTER_THIS_MONTH) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return { startIso: start.toISOString(), endIso: end.toISOString() }
  }
  if (filter === DATE_FILTER_LAST_MONTH) {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 1)
    return { startIso: start.toISOString(), endIso: end.toISOString() }
  }
  const start = new Date(now)
  start.setMonth(start.getMonth() - 3)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

export default function Home({ onOpenTask, embedded = false }) {
  const navigation = useNavigation()
  const route = useRoute()
  const { user, personel, permissions, profile, loading: authLoading } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const canWebPanel = hasWebPanelAccess(permissions, isSystemAdmin)
  const tabBarPad = useTabBarScrollPadding(kitSpacing.sm)
  const operatorHomeRef = useRef(null)
  const [permission, requestPermission] = useCameraPermissions()
  const [totalToday, setTotalToday] = useState(0)
  const [completedToday, setCompletedToday] = useState(0)
  const [pendingToday, setPendingToday] = useState(0)
  const [myTotalToday, setMyTotalToday] = useState(0)
  const [myCompletedToday, setMyCompletedToday] = useState(0)
  const [myPendingToday, setMyPendingToday] = useState(0)
  const [marchPuan, setMarchPuan] = useState(0)
  const [recentCompleted, setRecentCompleted] = useState([])
  const [gainedPointsToday, setGainedPointsToday] = useState(0)
  const [pendingDenetimler, setPendingDenetimler] = useState(0)
  const [weeklyPoints, setWeeklyPoints] = useState(0)
  const [weeklyRank, setWeeklyRank] = useState(null)
  const [unitRanking, setUnitRanking] = useState([])
  const [liveFeed, setLiveFeed] = useState([])
  const [weatherTemp, setWeatherTemp] = useState(null)
  const [weatherCode, setWeatherCode] = useState(null)
  const [managerSummaryModalVisible, setManagerSummaryModalVisible] = useState(false)
  const [notificationsModalVisible, setNotificationsModalVisible] = useState(false)
  const [nextTask, setNextTask] = useState(null)
  const [managerFocusMode, setManagerFocusMode] = useState(null)
  const [leaderboardTop, setLeaderboardTop] = useState([])
  const [dateFilter, setDateFilter] = useState(DATE_FILTER_TODAY)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [flashlightVisible, setFlashlightVisible] = useState(false)
  const [qrModalVisible, setQrModalVisible] = useState(false)
  const [alertMessage, setAlertMessage] = useState(null)
  const [urgentCountToday, setUrgentCountToday] = useState(0)
  const [urgentTaskToOpen, setUrgentTaskToOpen] = useState(null)
  const [todayOverdueCount, setTodayOverdueCount] = useState(0)
  const [selectedAvatarId, setSelectedAvatarId] = useState(DEFAULT_AVATAR_ID)
  const [streakDays, setStreakDays] = useState(0)
  const [weeklyTrend, setWeeklyTrend] = useState([0, 0, 0, 0, 0, 0, 0])
  const [activeStaffCount, setActiveStaffCount] = useState(0)
  const [totalStaffCount, setTotalStaffCount] = useState(0)
  const [announcementModalVisible, setAnnouncementModalVisible] = useState(false)
  const [announcementLoading, setAnnouncementLoading] = useState(false)
  const [announcementUnits, setAnnouncementUnits] = useState([])
  const [selectedAnnouncementUnitIds, setSelectedAnnouncementUnitIds] = useState([])
  const [announcementText, setAnnouncementText] = useState('')
  const [todayAnnouncementCount, setTodayAnnouncementCount] = useState(0)
  const [resolvedUnitName, setResolvedUnitName] = useState(null)
  const [resolvedCompanyName, setResolvedCompanyName] = useState(null)
  const [managerReportJobs, setManagerReportJobs] = useState([])
  const [managerKpiDateFilter, setManagerKpiDateFilter] = useState('today')
  const [reportScope, setReportScope] = useState(CUBICLE_REPORT_SCOPE_DEFAULT)
  const recentAnimValues = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current
  /** focus’ta hızlı üst üste load çağrılırsa eski ikinci aşama state’i ezmesin */
  const homeLoadGenRef = useRef(0)

  const isPermTruthy = useCallback((key) => isPermTruthyShared(permissions, key), [permissions])
  const canAssignTask = canAssignTasks(permissions, personel)
  const canCreateTask = canCreateTasks(permissions)
  const isManager = hasManagementPrivileges(permissions, personel)
  const taskNotifications = useTaskNotifications()
  const isTopCompanyScope = isTopCompanyScopeShared(personel, permissions)
  const accessibleUnitIds = useMemo(
    () => (Array.isArray(personel?.accessibleUnitIds) ? personel.accessibleUnitIds : []),
    [personel?.accessibleUnitIds],
  )
  const birimHierarchyCtx = useMemo(
    () => ({
      isSystemAdmin,
      isTopCompanyScope,
      accessibleUnitIds,
      fallbackBirimId: personel?.birim_id ?? null,
    }),
    [isSystemAdmin, isTopCompanyScope, accessibleUnitIds, personel?.birim_id],
  )
  const canSendAnnouncement =
    isManager &&
    (canAssignTask ||
      isPermTruthy('gorev_onayla') ||
      isPermTruthy('view_reports') ||
      isPermTruthy('manage_staff'))

  const displayNameRaw =
    (personel?.ad ? String(personel.ad).trim() : '') ||
    (user?.email ? String(user.email).split('@')[0] : 'Kullanıcı')
  const displayName = displayNameRaw
    ? `${displayNameRaw.charAt(0).toLocaleUpperCase('tr-TR')}${displayNameRaw
        .slice(1)
        .toLocaleLowerCase('tr-TR')}`
    : 'Kullanıcı'
  const unitName = resolvedUnitName || null
  const companyName = resolvedCompanyName || 'Şirket'
  const greetingSubtitle = unitName ? `${companyName} • ${unitName}` : companyName

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

    resolveNames()
    return () => {
      mounted = false
    }
  }, [personel?.ana_sirket_id, personel?.birim_id])

  const load = useCallback(async () => {
    setAlertMessage(null)
    setUrgentCountToday(0)
    setUrgentTaskToOpen(null)
    setTodayOverdueCount(0)
    setManagerReportJobs([])
    if (!user?.id) {
      setTotalToday(0)
      setCompletedToday(0)
      setPendingToday(0)
      setMyTotalToday(0)
      setMyCompletedToday(0)
      setMyPendingToday(0)
      setMarchPuan(0)
      setRecentCompleted([])
      setPendingDenetimler(0)
      setWeeklyPoints(0)
      setWeeklyRank(null)
      setNextTask(null)
      setLeaderboardTop([])
      setManagerFocusMode(null)
      setWeeklyTrend([0, 0, 0, 0, 0, 0, 0])
      setStreakDays(0)
      setActiveStaffCount(0)
      setTotalStaffCount(0)
      setTodayAnnouncementCount(0)
      setTodayOverdueCount(0)
      setLoading(false)
      return
    }
    if (!personel?.id || !personel?.ana_sirket_id) {
      setTotalToday(0)
      setCompletedToday(0)
      setPendingToday(0)
      setMyTotalToday(0)
      setMyCompletedToday(0)
      setMyPendingToday(0)
      setMarchPuan(0)
      setRecentCompleted([])
      setPendingDenetimler(0)
      setWeeklyPoints(0)
      setWeeklyRank(null)
      setNextTask(null)
      setManagerFocusMode(null)
      setLeaderboardTop([])
      setWeeklyTrend([0, 0, 0, 0, 0, 0, 0])
      setStreakDays(0)
      setActiveStaffCount(0)
      setTotalStaffCount(0)
      setTodayAnnouncementCount(0)
      setTodayOverdueCount(0)
      setLoading(false)
      setRefreshing(false)
      setAlertMessage(null)
      return
    }

    if (!isTopCompanyScope && !personel?.birim_id) {
      setTotalToday(0)
      setCompletedToday(0)
      setPendingToday(0)
      setMyTotalToday(0)
      setMyCompletedToday(0)
      setMyPendingToday(0)
      setMarchPuan(0)
      setRecentCompleted([])
      setPendingDenetimler(0)
      setWeeklyPoints(0)
      setWeeklyRank(null)
      setNextTask(null)
      setManagerFocusMode(null)
      setLeaderboardTop([])
      setTodayAnnouncementCount(0)
      setTodayOverdueCount(0)
      setLoading(false)
      setRefreshing(false)
      return
    }

    try {
      const myGen = ++homeLoadGenRef.current
      // Mobil ana sayfa tamamen bugün verisiyle çalışır.
      const { startIso: dayStartIso, endIso: dayEndIso } = getRangeForFilter(DATE_FILTER_TODAY)
      const todayStart = dayStartIso
      const todayEnd = dayEndIso
      // Ana sayfa tamamen bugün odaklı çalışır.
      const lbStartIso = dayStartIso
      const lbEndIso = dayEndIso
      const filterByOnaySirasi = async (rows) => {
        const list = Array.isArray(rows) ? rows : []
        const zincirOnayIds = list
          .filter((r) => {
            const t = String(r?.gorev_turu || '').toLowerCase()
            return t === 'zincir_onay' || t === 'zincir_gorev_ve_onay'
          })
          .map((r) => r?.id)
          .filter(Boolean)
        const zincirGorevIds = list
          .filter((r) => {
            const t = String(r?.gorev_turu || '').toLowerCase()
            return t === 'zincir_gorev' || t === 'zincir_gorev_ve_onay'
          })
          .map((r) => r?.id)
          .filter(Boolean)
        if (!zincirOnayIds.length && !zincirGorevIds.length) return list

        const [onayRes, gorevRes] = await Promise.all([
          zincirOnayIds.length
            ? supabase
                .from('isler_zincir_onay_adimlari')
                .select('is_id, adim_no, onaylayici_personel_id')
                .in('is_id', zincirOnayIds)
            : Promise.resolve({ data: [] }),
          zincirGorevIds.length
            ? supabase
                .from('isler_zincir_gorev_adimlari')
                .select('is_id, adim_no, personel_id')
                .in('is_id', zincirGorevIds)
            : Promise.resolve({ data: [] }),
        ])

        const onayByTask = {}
        for (const s of onayRes?.data || []) {
          const key = String(s?.is_id || '')
          if (!key) continue
          if (!onayByTask[key]) onayByTask[key] = []
          onayByTask[key].push(s)
        }
        const gorevByTask = {}
        for (const s of gorevRes?.data || []) {
          const key = String(s?.is_id || '')
          if (!key) continue
          if (!gorevByTask[key]) gorevByTask[key] = []
          gorevByTask[key].push(s)
        }

        return list.filter((task) => {
          const t = String(task?.gorev_turu || '').toLowerCase()
          const taskId = String(task?.id || '')
          const inAuditQueue = isPendingApprovalTaskStatus(task?.durum)
          if (t === 'zincir_gorev' || t === 'zincir_gorev_ve_onay') {
            if (inAuditQueue) return true
            const activeGorevAdim = Number(task?.zincir_aktif_adim) || 1
            const gorevStep = (gorevByTask[taskId] || []).find((x) => Number(x?.adim_no) === activeGorevAdim)
            if (gorevStep && String(gorevStep.personel_id || '') !== String(personel?.id || '')) return false
          }
          if (t === 'zincir_onay' || t === 'zincir_gorev_ve_onay') {
            const activeOnayAdim = Number(task?.zincir_onay_aktif_adim) || 1
            const onayStep = (onayByTask[taskId] || []).find((x) => Number(x?.adim_no) === activeOnayAdim)
            if (onayStep && String(onayStep.onaylayici_personel_id || '') !== String(personel?.id || '')) return false
          }
          return true
        })
      }

      // KPI'lar: personel kendi görevleri, yönetici kendi birimi
      let todayQuery = supabase
        .from('isler')
        .select('id, durum, acil, created_at, updated_at, son_tarih, puan, birim_id, sorumlu_personel_id')
        .eq('ana_sirket_id', personel.ana_sirket_id)
        .gte('created_at', todayStart)
        .lt('created_at', todayEnd)

      if (isManager) {
        todayQuery = restrictQueryByPersonelBirimHierarchy(todayQuery, birimHierarchyCtx)
      } else {
        todayQuery = todayQuery.eq('sorumlu_personel_id', personel.id)
        todayQuery = restrictQueryByPersonelBirimHierarchy(todayQuery, birimHierarchyCtx)
      }

      // "1 acil görev aktif" çağrısı kişisel bir aksiyondur (tıklandığında ilgili görev detayı açılır).
      // Bu nedenle yönetici de olsa, yalnız KENDİ sorumlu olduğu acil görevler sayılmalı; aksi halde
      // yöneticiye, başkasına atadığı görevin tamamlama ekranı açılır ve kanıtı silebilir.
      let urgentQuery = supabase
        .from('isler')
        .select('id, baslik, durum, acil, created_at, sorumlu_personel_id')
        .eq('ana_sirket_id', personel.ana_sirket_id)
        .eq('acil', true)
        .eq('sorumlu_personel_id', personel.id)
        .gte('created_at', dayStartIso)
        .lt('created_at', dayEndIso)
        .order('created_at', { ascending: true })
        .limit(20)
      urgentQuery = restrictQueryByPersonelBirimHierarchy(urgentQuery, birimHierarchyCtx)

      // Canlı saha şeridi — KPI beklenmeden istek başlasın (ikinci faz Promise.all en yavaş sorguya kilitlenmesin).
      const liveFeedEarlyPromise = isManager
        ? fetchManagerLiveFieldAuditTasks(supabase, {
            personel,
            isSystemAdmin,
            isTopCompanyScope,
            liveStatuses: LIVE_FIELD_AUDIT_TASK_STATUSES,
            candidateLimit: 220,
            privateMergeLimit: 140,
          })
        : null

      const [todayRes, urgentRes] = await Promise.all([todayQuery, urgentQuery])
      const { data: todayData, error: todayError } = todayRes

      if (todayError) {
        setTotalToday(0)
        setCompletedToday(0)
        setPendingToday(0)
        setMyTotalToday(0)
        setMyCompletedToday(0)
        setMyPendingToday(0)
        setGainedPointsToday(0)
        setUnitRanking([])
        setPendingDenetimler(0)
        setWeeklyPoints(0)
        setWeeklyRank(null)
      } else {
        const todayList = shallowCloneRows(todayData)
        setTotalToday(todayList.length)
        const completedList = todayList.filter((t) => isCompleted(t?.durum))
        const pendingList = todayList.filter((t) => !isCompleted(t?.durum))
        setCompletedToday(completedList.length)
        setPendingToday(pendingList.length)
        try {
          const urgentRows = urgentRes?.data
          const myPid = String(personel?.id || '')
          const activeUrgents = (urgentRows || []).filter(
            (t) =>
              !!t?.acil &&
              !isCompleted(t?.durum) &&
              // Yönetici olsa bile yalnız kendi sorumlu olduğu acil görevler sayılır;
              // aksi halde "Acil görev aç" tıkı başkasının görev tamamlama ekranını açar.
              String(t?.sorumlu_personel_id || '') === myPid,
          )
          setUrgentCountToday(activeUrgents.length)
          setUrgentTaskToOpen(activeUrgents[0] || null)
        } catch {
          setUrgentCountToday(0)
          setUrgentTaskToOpen(null)
        }
        const ownList = isManager
          ? todayList.filter((t) => String(t?.sorumlu_personel_id || '') === String(personel?.id || ''))
          : todayList
        const ownCompleted = ownList.filter((t) => isCompleted(t?.durum))
        const ownPending = ownList.filter((t) => !isCompleted(t?.durum))
        setMyTotalToday(ownList.length)
        setMyCompletedToday(ownCompleted.length)
        setMyPendingToday(ownPending.length)
        setGainedPointsToday(
          completedList.reduce((acc, t) => acc + (Number(t?.puan) || 0), 0),
        )
        if (isManager) {
          const nowIsoFast = new Date().toISOString()
          const fastPending = todayList.filter((t) =>
            [TASK_STATUS.PENDING_APPROVAL, TASK_STATUS.RESUBMITTED].includes(normalizeTaskStatus(t?.durum)),
          ).length
          const fastOverdue = todayList.filter((t) => {
            const dueIso = t?.son_tarih
            if (!dueIso) return false
            if (String(dueIso) >= nowIsoFast) return false
            const d = normalizeTaskStatus(t?.durum)
            if (isCompleted(d)) return false
            if (isPendingApprovalTaskStatus(d)) {
              const due = new Date(dueIso)
              const completedAt = new Date(t?.updated_at || t?.created_at || 0)
              if (!Number.isNaN(due.getTime()) && !Number.isNaN(completedAt.getTime()) && completedAt <= due) {
                return false
              }
            }
            return true
          }).length
          setPendingDenetimler(fastPending)
          setTodayOverdueCount(fastOverdue)
        }

        // KPI'lar: denetim bekleyen sayısı (yöneticiler) ve haftalık sıralama (personel)
        if (isManager) {
          setWeeklyPoints(0)
          setWeeklyRank(null)
          try {
            let pendingQuery = supabase
              .from('isler')
              .select('id', { count: 'exact', head: true })
              .in('durum', [TASK_STATUS.PENDING_APPROVAL, TASK_STATUS.RESUBMITTED])
              .eq('ana_sirket_id', personel.ana_sirket_id)
              .gte('created_at', dayStartIso)
              .lt('created_at', dayEndIso)

            pendingQuery = restrictQueryByPersonelBirimHierarchy(pendingQuery, birimHierarchyCtx)

            let annQuery = supabase
              .from('duyurular')
              .select('id', { count: 'exact', head: true })
              .eq('ana_sirket_id', personel.ana_sirket_id)
              .gte('created_at', dayStartIso)
              .lt('created_at', dayEndIso)
            annQuery = restrictAnnouncementQueryByTargetUnits(annQuery, birimHierarchyCtx)

            const [pendingResult, annResult] = await Promise.all([pendingQuery, annQuery])
            setPendingDenetimler(Number(pendingResult.count) || 0)
            setTodayAnnouncementCount(Number(annResult.count) || 0)
          } catch {
            setPendingDenetimler(0)
            setTodayAnnouncementCount(0)
          }
        } else {
          setPendingDenetimler(0)
          setTodayAnnouncementCount(0)
          try {
            const completedStatuses = [TASK_STATUS.APPROVED]
            let weekQuery = supabase
              .from('isler')
              .select('sorumlu_personel_id, puan')
              .eq('ana_sirket_id', personel.ana_sirket_id)
              .in('durum', completedStatuses)
              .gte('bitis_tarihi', todayStart)
              .lt('bitis_tarihi', todayEnd)

            weekQuery = restrictQueryByPersonelBirimHierarchy(weekQuery, birimHierarchyCtx)

            const { data: weekRows } = await weekQuery

            const totals = {}
            for (const r of weekRows || []) {
              const pid = String(r?.sorumlu_personel_id ?? '')
              if (!pid) continue
              totals[pid] = (totals[pid] || 0) + (Number(r?.puan) || 0)
            }

            const selfId = String(personel.id)
            const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1])
            const selfPoints = totals[selfId] || 0
            const idx = sorted.findIndex(([pid]) => pid === selfId)

            setWeeklyPoints(selfPoints)
            setWeeklyRank(idx >= 0 ? idx + 1 : null)
          } catch {
            setWeeklyPoints(0)
            setWeeklyRank(null)
          }
        }

        if (isManager && isTopCompanyScope) {
          const byBirim = {}
          for (const t of todayList) {
            const bid = t?.birim_id ?? 'unknown'
            if (!byBirim[bid]) byBirim[bid] = { birim_id: bid, total: 0, completed: 0 }
            byBirim[bid].total += 1
            if (isCompleted(t?.durum)) byBirim[bid].completed += 1
          }

          const rankingBase = Object.values(byBirim)
            .map((r) => ({
              birim_id: r.birim_id,
              completionRate: r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0,
              completed: r.completed,
              total: r.total,
            }))
            .sort((a, b) => b.completionRate - a.completionRate || b.completed - a.completed)
            .slice(0, 5)

          const birimIds = rankingBase.map((r) => r.birim_id).filter((x) => x && x !== 'unknown')
          if (birimIds.length) {
            try {
              const { data: birimlerData } = await supabase
                .from('birimler')
                .select('id, birim_adi')
                .in('id', birimIds)
                .eq('ana_sirket_id', personel.ana_sirket_id)
              const map = {}
              ;(birimlerData || []).forEach((b) => {
                map[b.id] = b.birim_adi
              })
              setUnitRanking(
                rankingBase.map((r) => ({
                  ...r,
                  birim_adi: map[r.birim_id] || String(r.birim_id),
                })),
              )
            } catch {
              setUnitRanking(rankingBase)
            }
          } else {
            setUnitRanking(rankingBase)
          }
        } else {
          setUnitRanking([])
        }
      }

      setLoading(false)
      setRefreshing(false)

      void (async () => {
        if (homeLoadGenRef.current !== myGen) return
        try {
      if (isManager) {
        void (async () => {
          try {
            const poolStart = new Date()
            poolStart.setDate(poolStart.getDate() - 90)
            poolStart.setHours(0, 0, 0, 0)

            let reportPoolQuery = supabase
              .from('isler')
              .select(
                'id, baslik, durum, acil, created_at, updated_at, son_tarih, baslama_tarihi, gorunur_tarih, puan, sorumlu_personel_id, birim_id, tamamlama_gecmisi, denetim_gecmisi',
              )
              .eq('ana_sirket_id', personel.ana_sirket_id)
              .gte('updated_at', poolStart.toISOString())
              .order('updated_at', { ascending: false })
              .limit(500)
            reportPoolQuery = restrictQueryByPersonelBirimHierarchy(reportPoolQuery, birimHierarchyCtx)

            const poolRes = await reportPoolQuery
            if (homeLoadGenRef.current !== myGen) return

            setManagerReportJobs(shallowCloneRows(poolRes.data || []))
          } catch {
            if (homeLoadGenRef.current !== myGen) return
            setManagerReportJobs([])
          }
        })()
      }

      if (isManager && liveFeedEarlyPromise) {
        void (async () => {
          try {
            const feedRes = await liveFeedEarlyPromise
            if (homeLoadGenRef.current !== myGen) return
            const { data: feedData, error: feedErr } = feedRes
            if (!feedErr && feedData?.length) {
              const baseFeed = shallowCloneRows(feedData)
              const personelIdsEarly = [
                ...new Set(baseFeed.map((f) => f?.sorumlu_personel_id).filter(Boolean)),
              ]
              const namesPromise =
                personelIdsEarly.length > 0
                  ? supabase
                      .from('personeller')
                      .select('id, ad, soyad')
                      .eq('ana_sirket_id', personel.ana_sirket_id)
                      .in('id', personelIdsEarly)
                  : Promise.resolve({ data: [] })

              const [, namesRes] = await Promise.all([
                attachChainGorevPhotosToRows(supabase, baseFeed).then((rows) =>
                  attachChainGorevVideosToRows(supabase, rows),
                ),
                namesPromise,
              ])

              if (homeLoadGenRef.current !== myGen) return

              const withThumb = baseFeed.map((row) => {
                const existingThumb = getFirstPhotoUrl(row)
                if (existingThumb) return { ...row, thumb_url: existingThumb, thumb_kind: 'photo' }
                const checklistRows = Array.isArray(row?.checklist_cevaplari) ? row.checklist_cevaplari : []
                for (const ans of checklistRows) {
                  const photos = Array.isArray(ans?.fotograflar) ? ans.fotograflar.filter(Boolean) : []
                  if (photos.length) return { ...row, thumb_url: photos[0], thumb_kind: 'photo' }
                  const fromAns = extractKanitPhotoUrls(ans)
                  if (fromAns.length) return { ...row, thumb_url: fromAns[0], thumb_kind: 'photo' }
                }
                const videoUrl = getFirstVideoEvidenceUrlFromJob(row)
                if (videoUrl) return { ...row, thumb_url: videoUrl, thumb_kind: 'video' }
                return { ...row, thumb_url: null, thumb_kind: null }
              })

              const peopleRows = namesRes?.data || []
              const map = {}
              peopleRows.forEach((p) => {
                map[String(p.id)] = formatFullName(p.ad, p.soyad, 'Personel')
              })

              for (const row of withThumb) {
                const u = row?.thumb_url
                if (row?.thumb_kind === 'photo' && typeof u === 'string' && u.length > 4) {
                  void Image.prefetch(u).catch(() => {})
                }
              }

              setLiveFeed(
                withThumb.map((item) => ({
                  ...item,
                  sorumlu_personel_adi: map[String(item?.sorumlu_personel_id)] || 'Personel',
                })),
              )
            } else {
              setLiveFeed([])
            }
          } catch {
            if (homeLoadGenRef.current !== myGen) return
            setLiveFeed([])
          }
        })()
      }

      const nowIsoParallel = new Date().toISOString()
      const isManagerOverdueTask = (task) => {
        const durum = normalizeTaskStatus(task?.durum)
        const dueIso = task?.son_tarih
        if (!dueIso) return false
        if (String(dueIso) < String(dayStartIso)) return false
        if (String(dueIso) >= nowIsoParallel) return false
        if (isCompleted(durum)) return false
        if (isPendingApprovalTaskStatus(durum)) {
          const due = new Date(dueIso)
          const completedAt = new Date(task?.updated_at || task?.created_at || 0)
          if (!Number.isNaN(due.getTime()) && !Number.isNaN(completedAt.getTime()) && completedAt <= due) {
            return false
          }
        }
        return true
      }

      const trendStart = new Date()
      trendStart.setHours(0, 0, 0, 0)
      trendStart.setDate(trendStart.getDate() - 6)
      const trendEnd = new Date()
      trendEnd.setHours(23, 59, 59, 999)

      let trendQuery = supabase
        .from('isler')
        .select('puan, bitis_tarihi, durum, sorumlu_personel_id, birim_id')
        .eq('ana_sirket_id', personel.ana_sirket_id)
        .eq('sorumlu_personel_id', personel.id)
        .eq('durum', TASK_STATUS.APPROVED)
        .gte('bitis_tarihi', trendStart.toISOString())
        .lte('bitis_tarihi', trendEnd.toISOString())

      trendQuery = restrictQueryByPersonelBirimHierarchy(trendQuery, birimHierarchyCtx)

      let recentQuery = supabase
        .from('isler')
        .select('id, baslik, durum, bitis_tarihi, updated_at, created_at, ana_sirket_id, birim_id, red_nedeni, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim')
        .eq('ana_sirket_id', personel.ana_sirket_id)
        .in('durum', [
          TASK_STATUS.APPROVED,
          TASK_STATUS.PENDING_APPROVAL,
          TASK_STATUS.RESUBMITTED,
          TASK_STATUS.REJECTED,
        ])
        .gte('updated_at', dayStartIso)
        .lt('updated_at', dayEndIso)
        .order('updated_at', { ascending: false })
        .limit(3)

      if (isManager) {
        recentQuery = restrictQueryByPersonelBirimHierarchy(recentQuery, birimHierarchyCtx)
      } else {
        recentQuery = recentQuery.eq('sorumlu_personel_id', personel.id)
        recentQuery = restrictQueryByPersonelBirimHierarchy(recentQuery, birimHierarchyCtx)
      }

      let alertFetch
      if (isManager) {
        let overdueQuery = supabase
          .from('isler')
          .select('id, durum, son_tarih, created_at, updated_at, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim')
          .eq('ana_sirket_id', personel.ana_sirket_id)
          .gte('created_at', dayStartIso)
          .lt('created_at', dayEndIso)
          .gte('son_tarih', dayStartIso)
          .lt('son_tarih', nowIsoParallel)
          .order('son_tarih', { ascending: true })
          .limit(80)

        overdueQuery = restrictQueryByPersonelBirimHierarchy(overdueQuery, birimHierarchyCtx)

        alertFetch = overdueQuery
      } else {
        alertFetch = supabase
          .from('isler')
          .select('id, durum')
          .eq('ana_sirket_id', personel.ana_sirket_id)
          .eq('sorumlu_personel_id', personel.id)
          .gte('created_at', dayStartIso)
          .lt('created_at', dayEndIso)
          .order('created_at', { ascending: false })
          .limit(20)
      }

      let focusFetch
      if (isManager) {
        focusFetch = fetchManagerFocusApprovalHead(supabase, {
          personel,
          isSystemAdmin,
          isTopCompanyScope,
        })
      } else {
        focusFetch = supabase
          .from('isler')
          .select('id, baslik, son_tarih, created_at, durum, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim')
          .eq('ana_sirket_id', personel.ana_sirket_id)
          .eq('sorumlu_personel_id', personel.id)
          .gte('created_at', dayStartIso)
          .lt('created_at', dayEndIso)
          .order('son_tarih', { ascending: true, nullsFirst: false })
          .limit(10)
      }

      const [recentRes, trendRes, alertRes, focusRes] = await Promise.all([
        recentQuery,
        trendQuery,
        alertFetch,
        focusFetch,
      ])

      const { data: son3Data, error: son3Error } = recentRes

      if (!son3Error && son3Data) {
        const visibleRecent = await filterByOnaySirasi(son3Data)
        setRecentCompleted(shallowCloneRows(visibleRecent))
      } else {
        setRecentCompleted([])
      }

      // Personel gamification: günlük seri + son 7 gün puan trendi
      try {
        const { data: trendRows } = trendRes
        const pointsByDay = {}
        for (let i = 0; i < 7; i += 1) {
          const d = new Date(trendStart)
          d.setDate(d.getDate() + i)
          pointsByDay[d.toISOString().slice(0, 10)] = 0
        }
        ;(trendRows || []).forEach((r) => {
          const key = String(r?.bitis_tarihi || '').slice(0, 10)
          if (!pointsByDay[key] && pointsByDay[key] !== 0) return
          pointsByDay[key] += Number(r?.puan) || 0
        })

        const trend = Object.keys(pointsByDay)
          .sort()
          .map((k) => pointsByDay[k] || 0)
        setWeeklyTrend(trend)

        let streak = 0
        for (let i = trend.length - 1; i >= 0; i -= 1) {
          if ((trend[i] || 0) >= DAILY_TARGET_POINTS) streak += 1
          else break
        }
        setStreakDays(streak)
      } catch {
        setWeeklyTrend([0, 0, 0, 0, 0, 0, 0])
        setStreakDays(0)
      }

      // AlertBar (Promise.all dalı)
      try {
        if (isManager) {
          const overdueRows = alertRes?.data
          const visibleOverdueRows = await filterByOnaySirasi(overdueRows || [])
          const notCompleted = (visibleOverdueRows || []).filter(isManagerOverdueTask)
          const overdueCount = notCompleted.length
          setTodayOverdueCount(overdueCount)
          if (overdueCount > 0) {
            setAlertMessage(`Dikkat: Süresi geçen ${overdueCount} adet görev bulunuyor!`)
          } else {
            setAlertMessage(null)
          }
        } else {
          setTodayOverdueCount(0)
          const rejectedRows = alertRes?.data

          const normalize = (v) =>
            String(v ?? '')
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
          const isRejectedDurum = (durum) => {
            const d = normalize(durum)
            return d.includes('revize') || d.includes('revizyon') || d.includes('redd') || d.includes('red')
          }
          const rejectedCount = (rejectedRows || []).filter((r) => isRejectedDurum(r?.durum)).length
          if (rejectedCount > 0) {
            setAlertMessage(rejectedCount === 1 ? '1 görevin revize edilmeli!' : `${rejectedCount} görevin revize edilmesi gerekiyor!`)
          } else {
            setAlertMessage(null)
          }
        }
      } catch {
        setTodayOverdueCount(0)
        setAlertMessage(null)
      }

      // Focus Widget (Promise.all dalı)
      try {
        if (isManager) {
          const { data: focusData, error: focusErr } = focusRes
          if (!focusErr && focusData?.length) {
            setNextTask(focusData[0] || null)
            setManagerFocusMode(focusData[0] ? 'approval' : null)
          } else {
            setNextTask(null)
            setManagerFocusMode(null)
          }
        } else {
          const { data: focusRows, error: focusErr } = focusRes
          if (focusErr) {
            setNextTask(null)
            setManagerFocusMode(null)
          } else {
            const visibleFocusRows = await filterByOnaySirasi(focusRows || [])

            const allowedRow = (visibleFocusRows || []).find((t) => {
              return (
                !isCompleted(t?.durum) &&
                !isPendingApprovalTaskStatus(t?.durum)
              )
            })

            setNextTask(allowedRow || null)
            setManagerFocusMode(null)
          }
        }
      } catch {
        setNextTask(null)
        setManagerFocusMode(null)
      }

      // KPI supplement: aktif görevdeki personel sayısı
      if (isManager) {
        try {
          let staffQuery = supabase
            .from('personeller')
            .select('id')
            .eq('ana_sirket_id', personel.ana_sirket_id)
            .is('silindi_at', null)
          staffQuery = restrictQueryByPersonelBirimHierarchy(staffQuery, birimHierarchyCtx)
          const { data: staffRows } = await staffQuery
          const ids = (staffRows || []).map((s) => s.id).filter(Boolean)
          setTotalStaffCount(ids.length)
          if (!ids.length) {
            setActiveStaffCount(0)
          } else {
            let activeQuery = supabase
              .from('isler')
              .select('sorumlu_personel_id, durum')
              .eq('ana_sirket_id', personel.ana_sirket_id)
              .in('sorumlu_personel_id', ids)
              .gte('created_at', dayStartIso)
              .lt('created_at', dayEndIso)
            activeQuery = restrictQueryByPersonelBirimHierarchy(activeQuery, birimHierarchyCtx)
            const { data: activeRows } = await activeQuery
            const activeSet = new Set()
            ;(activeRows || []).forEach((r) => {
              if (!isCompleted(r?.durum)) activeSet.add(String(r?.sorumlu_personel_id))
            })
            setActiveStaffCount(activeSet.size)
          }
        } catch {
          setActiveStaffCount(0)
          setTotalStaffCount(0)
        }
      } else {
        setActiveStaffCount(0)
        setTotalStaffCount(0)
      }

      // Leaderboard Strip: bugünün en iyi 3 personeli (puan_hareketleri tabanlı)
      try {
        let peopleQuery = supabase
          .from('personeller')
          .select('id, ad, soyad, birim_id, kullanici_id')
          .eq('ana_sirket_id', personel.ana_sirket_id)
          .is('silindi_at', null)
        peopleQuery = restrictQueryByPersonelBirimHierarchy(peopleQuery, birimHierarchyCtx)
        const { data: peopleData, error: peopleErr } = await peopleQuery
        if (peopleErr || !peopleData?.length) {
          setLeaderboardTop([])
        } else {
          const scopedIds = peopleData.map((p) => p.id).filter(Boolean)
          const totals = {}
          let phQuery = supabase
            .from('puan_hareketleri')
            .select('personel_id, puan_degisimi, tarih, islem_tipi')
            .in('personel_id', scopedIds)
            .gte('tarih', lbStartIso)
            .lt('tarih', lbEndIso)
          const { data: phRows, error: phErr } = await phQuery
          if (!phErr && phRows?.length) {
            for (const t of phRows) {
              const pid = String(t?.personel_id || '')
              if (!pid) continue
              const delta = Number(t?.puan_degisimi) || 0
              if (delta <= 0) continue
              totals[pid] = (totals[pid] || 0) + delta
            }
          }

          // Fallback: puan_hareketleri yoksa bugünkü onaylı iş puanlarından hesapla.
          if (!Object.keys(totals).length) {
            const { data: approvedTodayRows, error: approvedErr } = await supabase
              .from('isler')
              .select('sorumlu_personel_id, puan, durum, bitis_tarihi, created_at')
              .eq('ana_sirket_id', personel.ana_sirket_id)
              .in('sorumlu_personel_id', scopedIds)
              .eq('durum', TASK_STATUS.APPROVED)
              .gte('created_at', dayStartIso)
              .lt('created_at', dayEndIso)
            if (!approvedErr && approvedTodayRows?.length) {
              for (const r of approvedTodayRows) {
                const pid = String(r?.sorumlu_personel_id || '')
                if (!pid) continue
                totals[pid] = (totals[pid] || 0) + (Number(r?.puan) || 0)
              }
            }
          }

          const topIds = Object.entries(totals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([pid]) => pid)
          if (!topIds.length) {
            setLeaderboardTop([])
          } else {
            const nameMap = {}
            const userMap = {}
            const unitIdMap = {}
            ;(peopleData || []).forEach((p) => {
              nameMap[String(p.id)] = formatFullName(p.ad, p.soyad, 'Personel')
              userMap[String(p.id)] = p?.kullanici_id || null
              unitIdMap[String(p.id)] = p?.birim_id || null
            })
            const unitIds = [...new Set(topIds.map((pid) => unitIdMap[pid]).filter(Boolean))]
            const unitNameMap = {}
            if (unitIds.length) {
              try {
                const { data: unitsData } = await supabase
                  .from('birimler')
                  .select('id, birim_adi')
                  .in('id', unitIds)
                  .eq('ana_sirket_id', personel.ana_sirket_id)
                ;(unitsData || []).forEach((u) => {
                  unitNameMap[String(u.id)] = u?.birim_adi || 'Birim'
                })
              } catch {
                // ignore
              }
            }

            const avatarRows = await Promise.all(
              topIds.map(async (pid) => {
                const userId = userMap[pid]
                if (!userId) return [pid, DEFAULT_AVATAR_ID]
                const pref = await loadAvatarPreference(userId)
                return [pid, pref || DEFAULT_AVATAR_ID]
              }),
            )
            const avatarIdMap = Object.fromEntries(avatarRows)

            const maxPoints = Math.max(...topIds.map((pid) => Number(totals[pid] || 0)), 1)
            setLeaderboardTop(
              topIds.map((pid, idx) => ({
                id: pid,
                rank: idx + 1,
                name: nameMap[pid] || 'Personel',
                points: totals[pid] || 0,
                companyName: 'Şirket',
                unitName: unitNameMap[String(unitIdMap[pid])] || 'Birim',
                avatarId: avatarIdMap[pid] || DEFAULT_AVATAR_ID,
                progressPercent: Math.min(100, Math.round(((Number(totals[pid] || 0)) / maxPoints) * 100)),
              })),
            )
          }
        }
      } catch {
        setLeaderboardTop([])
      }

      await new Promise((resolve) => {
        InteractionManager.runAfterInteractions(() => resolve())
      })
      if (homeLoadGenRef.current !== myGen) return

      // Aylık net puan (kazanılan - kaybedilen): `puan_hareketleri` toplamından hesaplanır.
      // Gecikmiş görevler için de puan düşümü: Home açılışında "best-effort" uygulanır.
      if (!personel?.id || !personel?.ana_sirket_id) {
        setMarchPuan(0)
      } else {
        const now = new Date()
        const nowIso = now.toISOString()

        const isInReviewStateLocal = (durum) => {
          return isPendingApprovalTaskStatus(durum)
        }

        // 1) Gecikmiş görev cezalarını (henüz `Gecikmiş` olmayanları) uygula.
        try {
          let overdueQuery = supabase
            .from('isler')
            .select('id, puan, baslik, son_tarih, durum, ana_sirket_id, birim_id, sorumlu_personel_id, is_sablonlari(baslik)')
            .eq('sorumlu_personel_id', personel.id)
            .eq('ana_sirket_id', personel.ana_sirket_id)
            .lt('son_tarih', nowIso)

          overdueQuery = restrictQueryByPersonelBirimHierarchy(overdueQuery, birimHierarchyCtx)

          const { data: overdueRows } = await overdueQuery
          const candidates = (overdueRows || []).filter((t) => {
            const dNorm = normalizeDurum(t?.durum)
            if (!t?.son_tarih) return false
            if (isCompleted(t?.durum)) return false
            if (isInReviewStateLocal(t?.durum)) return false
            if (dNorm.includes('gecik')) return false
            return true
          })

          for (const task of candidates) {
            const baseScore = normalizeTaskScore(task?.puan)
            if (baseScore <= 0) continue

            const penalty = normalizeTaskScore(baseScore * -1)
            const gorevBaslik = task?.baslik || task?.is_sablonlari?.baslik || 'Görev'
            const note = `[AUTO_DELAY_${task.id}] Gecikmiş görev cezası: ${gorevBaslik}`

            // Idempotent: aynı personel + görev + TASK_DELAY_PENALTY için
            // mevcut kayıt varsa yeni ceza yazılmaz. DB tarafında partial
            // unique index ek bir güvence katmanıdır.
            await recordTaskPenaltyOnce({
              personelId: personel.id,
              gorevId: task.id,
              islemTipi: 'TASK_DELAY_PENALTY',
              delta: penalty,
              gorevBaslik,
              aciklama: note,
              tarih: task?.son_tarih || undefined,
            })

            // Durum setini standart tuttuğumuz için "Gecikmiş" gibi ekstra durum yazmıyoruz.
          }
        } catch {
          // best-effort: puan kartı yine de hesaplanır.
        }

        // 2) Sadece personel için bu ay net puanı `puan_hareketleri` üzerinden al.
        if (!isManager) {
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
          const monthEndExclusive = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0)

          const { data: monthRows, error: monthError } = await supabase
            .from('puan_hareketleri')
            .select('puan_degisimi')
            .eq('personel_id', personel.id)
            .gte('tarih', monthStart.toISOString())
            .lt('tarih', monthEndExclusive.toISOString())

          if (!monthError && monthRows) {
            const toplam = (monthRows || []).reduce((acc, r) => acc + (Number(r?.puan_degisimi) || 0), 0)
            setMarchPuan(Math.round(toplam * 100) / 100)
          } else {
            setMarchPuan(0)
          }
        } else {
          setMarchPuan(0)
        }
      }
        } catch (secondaryErr) {
          if (__DEV__) console.warn('[PODS] Home secondary load:', secondaryErr?.message || secondaryErr)
        }
      })()

    } catch (e) {
      setTotalToday(0)
      setCompletedToday(0)
      setPendingToday(0)
      setMyTotalToday(0)
      setMyCompletedToday(0)
      setMyPendingToday(0)
      setMarchPuan(0)
      setRecentCompleted([])
      setGainedPointsToday(0)
      setPendingDenetimler(0)
      setUnitRanking([])
      setWeeklyPoints(0)
      setWeeklyRank(null)
      setLiveFeed([])
      setNextTask(null)
      setLeaderboardTop([])
      setWeeklyTrend([0, 0, 0, 0, 0, 0, 0])
      setStreakDays(0)
      setManagerFocusMode(null)
      setTodayAnnouncementCount(0)
      setTodayOverdueCount(0)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [
    user?.id,
    personel?.id,
    personel?.ana_sirket_id,
    personel?.birim_id,
    personel?.accessibleUnitIds,
    isManager,
    isTopCompanyScope,
    isSystemAdmin,
    dateFilter,
    birimHierarchyCtx,
  ])

  const loadAvatarChoice = useCallback(async () => {
    if (!user?.id) {
      setSelectedAvatarId(DEFAULT_AVATAR_ID)
      return
    }
    const avatarId = await loadAvatarPreference(user.id)
    setSelectedAvatarId(avatarId || DEFAULT_AVATAR_ID)
  }, [user?.id])

  useFocusEffect(
    useCallback(() => {
      if (!user?.id || authLoading) return
      load()
      const avatarHandle = InteractionManager.runAfterInteractions(() => {
        loadAvatarChoice()
      })
      return () => {
        if (avatarHandle && typeof avatarHandle.cancel === 'function') avatarHandle.cancel()
      }
    }, [user?.id, authLoading, load, loadAvatarChoice])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await load()
      if (!isManager) {
        await operatorHomeRef.current?.reload?.()
        await taskNotifications.reload()
      }
    } finally {
      setRefreshing(false)
    }
  }, [load, isManager, taskNotifications])

  useEffect(() => {
    recentAnimValues.forEach((v) => v.setValue(0))
    const anims = recentAnimValues.map((v, idx) =>
      Animated.timing(v, {
        toValue: 1,
        duration: 340,
        delay: idx * 90,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    )
    Animated.stagger(60, anims).start()
  }, [recentCompleted, recentAnimValues])
  const openTaskDetail = useCallback(
    (id) => {
      if (id == null) return
      if (onOpenTask) onOpenTask(id)
      else navigation?.navigate?.('TaskDetail', { taskId: id })
    },
    [onOpenTask, navigation]
  )
  const hasFocusTask = !!nextTask?.id
  const focusSubtitle = nextTask?.son_tarih
    ? new Date(nextTask.son_tarih).toLocaleDateString('tr-TR')
    : isManager
      ? 'Denetim kuyruğu temiz'
      : hasFocusTask
        ? 'Bu görevi tamamlaman gerekiyor'
        : 'Günün tamamlandı, harika ilerliyorsun'
  const focusSubtitleManager = isManager ? new Date().toLocaleDateString('tr-TR') : focusSubtitle

  const loadAnnouncementUnits = useCallback(async () => {
    if (!personel?.ana_sirket_id) return
    let unitQuery = supabase
      .from('birimler')
      .select('id, birim_adi')
      .eq('ana_sirket_id', personel.ana_sirket_id)
      .order('birim_adi', { ascending: true })
    unitQuery = restrictBirimlerQueryByHierarchy(unitQuery, birimHierarchyCtx)
    const { data } = await unitQuery
    const units = (data || []).map((u) => ({ id: u.id, name: u.birim_adi || 'Birim' }))
    setAnnouncementUnits(units)
    setSelectedAnnouncementUnitIds(units.map((u) => u.id))
  }, [personel?.ana_sirket_id, personel?.birim_id, isTopCompanyScope, birimHierarchyCtx])

  const openQuickAnnouncement = useCallback(async () => {
    try {
      await loadAnnouncementUnits()
      setAnnouncementText('')
      setAnnouncementModalVisible(true)
    } catch {
      Alert.alert('Hata', 'Birimler yüklenemedi.')
    }
  }, [loadAnnouncementUnits])

  useEffect(() => {
    if (!route?.params?.openQuickAnnouncement) return
    if (!canSendAnnouncement) {
      navigation?.setParams?.({ openQuickAnnouncement: undefined })
      return
    }
    openQuickAnnouncement()
    navigation?.setParams?.({ openQuickAnnouncement: undefined })
  }, [route?.params?.openQuickAnnouncement, canSendAnnouncement, openQuickAnnouncement, navigation])

  useEffect(() => {
    let mounted = true
    const loadLiveWeather = async () => {
      try {
        // Istanbul default coordinates, fetched from live weather API.
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=41.01&longitude=28.97&current=temperature_2m,weather_code&timezone=auto',
        )
        const json = await res.json()
        if (!mounted) return
        setWeatherTemp(Math.round(Number(json?.current?.temperature_2m)))
        setWeatherCode(Number(json?.current?.weather_code))
      } catch {
        if (!mounted) return
        setWeatherTemp(null)
        setWeatherCode(null)
      }
    }
    const afterInteractions = InteractionManager.runAfterInteractions(() => {
      if (mounted) loadLiveWeather()
    })
    const timer = setInterval(() => {
      if (mounted) loadLiveWeather()
    }, 15 * 60 * 1000)
    return () => {
      mounted = false
      if (afterInteractions && typeof afterInteractions.cancel === 'function') afterInteractions.cancel()
      clearInterval(timer)
    }
  }, [])

  const toggleAnnouncementUnit = useCallback((unitId) => {
    setSelectedAnnouncementUnitIds((prev) => {
      if (prev.includes(unitId)) return prev.filter((id) => id !== unitId)
      return [...prev, unitId]
    })
  }, [])

  const sendAnnouncement = useCallback(async () => {
    const text = String(announcementText || '').trim()
    if (!text) {
      Alert.alert('Eksik bilgi', 'Duyuru metni boş olamaz.')
      return
    }
    if (!selectedAnnouncementUnitIds.length) {
      Alert.alert('Eksik seçim', 'En az bir birim seçmelisiniz.')
      return
    }
    if (!personel?.ana_sirket_id) return

    setAnnouncementLoading(true)
    try {
      const normalizedUnitIds = selectedAnnouncementUnitIds
        .map((id) => String(id || '').trim())
        .filter(Boolean)

      const { data: byPrimary } = await supabase
        .from('personeller')
        .select('id')
        .eq('ana_sirket_id', personel.ana_sirket_id)
        .in('birim_id', normalizedUnitIds)
        .is('silindi_at', null)

      let byJunction = []
      const jRes = await supabase
        .from('personel_birimleri')
        .select('personel_id')
        .eq('ana_sirket_id', personel.ana_sirket_id)
        .in('birim_id', normalizedUnitIds)
      const jMissing =
        jRes.error &&
        (jRes.error.code === '42P01' ||
          jRes.error.code === 'PGRST205' ||
          String(jRes.error.message || '')
            .toLowerCase()
            .includes('personel_birimleri'))
      if (!jRes.error && Array.isArray(jRes.data)) byJunction = jRes.data
      else if (!jMissing && jRes.error && __DEV__) {
        console.warn('[DUYURU] personel_birimleri:', jRes.error.message)
      }

      const targetIds = [
        ...new Set(
          [...(byPrimary || []), ...byJunction]
            .map((r) => r.personel_id ?? r.id)
            .filter(Boolean)
            .map(String),
        ),
      ]

      let targets = []
      if (targetIds.length) {
        const { data: rows } = await supabase
          .from('personeller')
          .select('id, ad, soyad, birim_id')
          .eq('ana_sirket_id', personel.ana_sirket_id)
          .in('id', targetIds)
          .is('silindi_at', null)
        targets = rows || []
      }
      if (!targetIds.length) {
        Alert.alert('Bilgi', 'Seçilen birimlerde kullanıcı bulunamadı.')
        return
      }

      // Push token kolon adı ortama göre farklı olabilir; sırayla dene.
      let tokenRows = []
      for (const tokenCol of ['expo_push_token', 'push_token', 'bildirim_tokeni']) {
        try {
          const { data } = await supabase
            .from('personeller')
            .select(`id, ${tokenCol}`)
            .in('id', targetIds)
          if (Array.isArray(data)) {
            tokenRows = data
              .map((r) => ({ id: r.id, token: r[tokenCol] }))
              .filter((r) => typeof r.token === 'string' && r.token.startsWith('ExponentPushToken'))
            if (tokenRows.length) break
          }
        } catch {
          // continue
        }
      }

      // Duyuru kaydı: tablo artık zorunlu.
      {
        const { error: insertError } = await supabase.from('duyurular').insert({
          ana_sirket_id: personel.ana_sirket_id,
          gonderen_personel_id: personel.id,
          metin: text,
          hedef_birim_ids: normalizedUnitIds,
        })
        if (insertError) {
          if (__DEV__) {
            console.warn('[DUYURU][INSERT_ERROR]', {
              code: insertError.code,
              message: insertError.message,
              details: insertError.details,
              hint: insertError.hint,
            })
          }
          const detail = insertError?.message || insertError?.details || 'Bilinmeyen hata'
          Alert.alert('Hata', `Duyuru veritabanına kaydedilemedi.\n${detail}`)
          return
        }
      }

      if (!tokenRows.length) {
        Alert.alert('Duyuru Kaydedildi', 'Push token bulunamadığı için anlık bildirim gönderilemedi.')
        setAnnouncementModalVisible(false)
        return
      }

      const pushPayload = tokenRows.map((r) => ({
        to: r.token,
        sound: 'default',
        title: 'Yeni Duyuru',
        body: text,
        data: { type: 'announcement', from_personel_id: personel.id },
      }))

      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
        body: JSON.stringify(pushPayload),
      })

      if (!res.ok) {
        Alert.alert('Kısmi başarı', 'Duyuru kaydedildi ancak push gönderimi başarısız oldu.')
      } else {
        Alert.alert('Başarılı', `${tokenRows.length} kullanıcıya duyuru bildirimi gönderildi.`)
      }
      setAnnouncementModalVisible(false)
    } catch {
      Alert.alert('Hata', 'Duyuru gönderilirken hata oluştu.')
    } finally {
      setAnnouncementLoading(false)
    }
  }, [announcementText, selectedAnnouncementUnitIds, personel?.ana_sirket_id, personel?.id])

  const monthlyNetPoints = Number(marchPuan) || 0
  const monthlyProgressPercent = Math.max(
    0,
    Math.min(100, (monthlyNetPoints / DAILY_TARGET_POINTS) * 100),
  )
  const personalPointsPercentInt = Math.trunc(monthlyProgressPercent)
  const kalanPuan = Math.max(0, DAILY_TARGET_POINTS - monthlyNetPoints)
  // "Performans Durumu" kartında aylık net puan göstereceğiz.
  const personalPointsPercent = personalPointsPercentInt
  const completedDailyGoal = monthlyNetPoints >= DAILY_TARGET_POINTS
  const managerNotifications = useMemo(() => {
    if (!isManager) return []
    const items = []
    if (alertMessage) {
      items.push({
        id: 'overdue_alert',
        Icon: Icon.Warning,
        title: 'Gecikme Uyarısı',
        detail: alertMessage,
        tone: 'warning',
      })
    }
    if (urgentCountToday > 0) {
      items.push({
        id: 'urgent_today',
        Icon: Icon.Urgent,
        title: 'Bugünün Acil Görevleri',
        detail: urgentCountToday === 1 ? '1 acil görev aktif' : `${urgentCountToday} acil görev aktif`,
        tone: 'danger',
      })
    }
    if (pendingDenetimler > 0) {
      items.push({
        id: 'audit_waiting',
        Icon: Icon.Audit,
        title: 'Denetim Bekleyen',
        detail: pendingDenetimler === 1 ? '1 görev onay bekliyor' : `${pendingDenetimler} görev onay bekliyor`,
        tone: 'info',
      })
    }
    return items.slice(0, 4)
  }, [isManager, alertMessage, urgentCountToday, pendingDenetimler])

  const [dismissedManagerNotifIds, setDismissedManagerNotifIds] = useState(() => new Set())

  useEffect(() => {
    setDismissedManagerNotifIds((prev) => {
      const next = new Set(prev)
      if (!alertMessage) next.delete('overdue_alert')
      if (urgentCountToday <= 0) next.delete('urgent_today')
      if (pendingDenetimler <= 0) next.delete('audit_waiting')
      return next.size === prev.size ? prev : next
    })
  }, [alertMessage, urgentCountToday, pendingDenetimler])

  const homeNotificationItems = useMemo(() => {
    if (isManager) {
      return managerNotifications.filter((n) => !dismissedManagerNotifIds.has(n.id))
    }
    return taskNotifications.notifications.map((n) => ({
      id: n.id,
      Icon:
        n.type === 'overdue' || n.type === 'personal_todo_overdue'
          ? Icon.Warning
          : n.type === 'due_soon' || n.type === 'personal_todo_due_1h'
            ? Icon.Clock
            : n.type === 'personal_todo_today'
              ? Icon.TodoList
              : n.type === 'audit_pending'
                ? Icon.Audit
                : n.type === 'assigned'
                  ? Icon.TaskAssign
                  : Icon.Tasks,
      title: n.title,
      detail: n.detail,
      tone: n.tone || 'info',
      raw: n,
    }))
  }, [isManager, managerNotifications, dismissedManagerNotifIds, taskNotifications.notifications])

  const unreadNotifCount = useMemo(() => {
    if (isManager) return homeNotificationItems.length
    return taskNotifications.unreadCount
  }, [isManager, homeNotificationItems.length, taskNotifications.unreadCount])

  const onMarkNotifRead = useCallback(
    (itemId) => {
      if (isManager) {
        setDismissedManagerNotifIds((prev) => new Set(prev).add(itemId))
        return
      }
      taskNotifications.markRead(itemId)
    },
    [isManager, taskNotifications],
  )

  const onMarkAllNotifsRead = useCallback(() => {
    if (isManager) {
      setDismissedManagerNotifIds((prev) => {
        const next = new Set(prev)
        for (const n of managerNotifications) next.add(n.id)
        return next
      })
      return
    }
    taskNotifications.markAllRead()
  }, [isManager, managerNotifications, taskNotifications])

  const openNotificationsModal = useCallback(() => {
    if (!isManager) void taskNotifications.reload()
    setNotificationsModalVisible(true)
  }, [isManager, taskNotifications])

  const onPressManagerNotification = useCallback(
    (itemId) => {
      if (itemId === 'urgent_today' && urgentTaskToOpen?.id) {
        navigation?.navigate?.('TaskDetail', { taskId: urgentTaskToOpen.id })
        return
      }
      if (itemId === 'audit_waiting') {
        navigation?.navigate?.('Denetim')
        return
      }
      if (itemId === 'announcement_today') {
        openQuickAnnouncement()
        return
      }
      if (itemId === 'overdue_alert') {
        navigation?.navigate?.('ManagerTasks', {
          initialOverdueTodayOnly: true,
          filterRequestId: Date.now(),
        })
      }
    },
    [navigation, urgentTaskToOpen?.id, openQuickAnnouncement],
  )

  const onPressHomeNotification = useCallback(
    (item) => {
      setNotificationsModalVisible(false)
      if (isManager) {
        onPressManagerNotification(item.id)
        return
      }
      taskNotifications.markRead(item.id)
      const raw = item.raw || item
      if (
        raw.type === 'personal_todo_overdue' ||
        raw.type === 'personal_todo_due_1h' ||
        raw.type === 'personal_todo_today'
      ) {
        navigation?.navigate?.('PersonalTodoList')
        return
      }
      if (raw.type === 'audit_pending') {
        navigation?.navigate?.('Denetim')
        return
      }
      const href = raw.href || ''
      const hrefMatch = href.match(/\/admin\/tasks\/([^/]+)/)
      if (hrefMatch?.[1]) {
        navigation?.navigate?.('TaskDetail', { taskId: hrefMatch[1] })
        return
      }
      const parts = String(raw.id || '').split(':')
      if (parts.length >= 2 && ['assigned', 'overdue', 'due', 'audit'].includes(parts[0])) {
        navigation?.navigate?.('TaskDetail', { taskId: parts[1] })
      }
    },
    [isManager, onPressManagerNotification, taskNotifications, navigation],
  )

  const handleFlashlightPress = useCallback(async () => {
    try {
      if (!permission?.granted) {
        const { granted } = await requestPermission()
        if (!granted) {
          Alert.alert('İzin gerekli', 'Feneri kullanmak için kamera izni verin.')
          return
        }
      }
      setFlashlightVisible(true)
    } catch (e) {
      Alert.alert('Hata', 'expo-camera kullanılamıyor.')
    }
  }, [permission?.granted, requestPermission])

  const handleQrPress = useCallback(async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission()
      if (!granted) {
        Alert.alert('İzin gerekli', 'QR okumak için kamera izni verin.')
        return
      }
    }
    setQrModalVisible(true)
  }, [permission?.granted, requestPermission])

  const handleBarcodeScanned = useCallback((result) => {
    const data = result?.data ?? result?.nativeEvent?.data ?? JSON.stringify(result)
    setQrModalVisible(false)
    if (Platform.OS === 'web') {
      alert('QR Okundu: ' + String(data))
    } else {
      Alert.alert('QR Okundu', String(data))
    }
  }, [])


  /**
   * Quick Actions konfigurasyonu (executive sayfalarda en alta kondurulur).
   * Her item lucide ikon ile gelir; render'da `IconBubble` icine cizilir.
   */
  const quickActions = useMemo(() => {
    const items = []
    if (canWebPanel) {
      items.push({
        key: 'projects',
        label: 'Projeler',
        tone: 'primary',
        Icon: Icon.Projects,
        onPress: () => navigation?.navigate?.('ProjectsList'),
      })
      items.push({
        key: 'calendar',
        label: 'Takvim',
        tone: 'warning',
        Icon: Icon.Calendar,
        onPress: () => navigation?.navigate?.('TaskCalendar'),
      })
    }
    if (canManageStaff(permissions, isSystemAdmin)) {
      items.push({
        key: 'presence',
        label: 'Canlı Durum',
        tone: 'success',
        Icon: Icon.Presence,
        onPress: () => navigation?.navigate?.('PresenceIndex'),
      })
    } else if (isManager) {
      items.push({
        key: 'tasks',
        label: 'Görevler',
        tone: 'accent',
        Icon: Icon.Tasks,
        onPress: () => navigation?.navigate?.('ManagerTasks'),
      })
    }
    if (canWebPanel) {
      items.push({
        key: 'todo',
        label: 'Yapılacaklar',
        tone: 'blurple',
        Icon: Icon.TodoList,
        onPress: () => navigation?.navigate?.('PersonalTodoList'),
      })
    }
    return items
  }, [canWebPanel, permissions, isSystemAdmin, isManager, navigation])

  const managerHomeKpis = useMemo(() => {
    if (!isManager) {
      return { pending: 0, overdue: 0, completed: 0, totalTasks: 0 }
    }
    return computeManagerHomeKpis(managerReportJobs, managerKpiDateFilter)
  }, [isManager, managerReportJobs, managerKpiDateFilter])

  const managerUrgentToday = useMemo(() => {
    if (!isManager) return []
    return filterCubicleHomeUrgentTodayTasks(managerReportJobs, new Date(), null)
  }, [isManager, managerReportJobs])

  // ───────────────────────────────────────────────────────────────────────────
  // RENDER
  // ───────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={hs.shell}>
        <HomeTopBar
          items={quickActions}
          embedded={embedded}
          showNotifications={!!personel?.id}
          notifCount={unreadNotifCount}
          onPressNotifications={openNotificationsModal}
        />
        <KitScreen padded background={kitPalette.background} topInset={false}>
          <View style={hs.centered}>
            <ActivityIndicator size="large" color={kitPalette.primary[700]} />
          </View>
        </KitScreen>
      </View>
    )
  }

  const greetingHour = new Date().getHours()
  const greetingText =
    greetingHour < 6
      ? 'İyi geceler'
      : greetingHour < 12
      ? 'Günaydın'
      : greetingHour < 18
      ? 'İyi günler'
      : 'İyi akşamlar'
  const WeatherIcon = mapWeatherIcon(weatherCode)
  const weatherLabel = Number.isFinite(weatherTemp) ? `${weatherTemp}°` : '—°'

  return (
    <View style={hs.shell}>
      <HomeTopBar
        items={quickActions}
        embedded={embedded}
        showNotifications={!!personel?.id}
        notifCount={unreadNotifCount}
        onPressNotifications={openNotificationsModal}
      />
    <KitScreen
      scroll
      padded
      topInset={false}
      onRefresh={onRefresh}
      refreshing={refreshing}
      bottomInset={false}
      contentContainerStyle={{ paddingBottom: tabBarPad }}
    >
      <HomeCompactGreeting
        eyebrow={`${greetingText} • ${getTodayDateString()}`}
        title={displayName}
        subtitle={greetingSubtitle}
        weatherLabel={weatherLabel}
        WeatherIcon={WeatherIcon}
        actions={
          isManager && canSendAnnouncement ? (
            <>
              <KitButton variant="accent" size="sm" onPress={openQuickAnnouncement}>
                Hızlı Duyuru
              </KitButton>
              <KitButton
                variant="secondary"
                size="sm"
                onPress={() => navigation?.navigate?.('Denetim')}
              >
                Denetim
              </KitButton>
            </>
          ) : null
        }
        style={hs.sectionGap}
      />

      {isManager ? (
        <>
          <UrgentTasksPanel
            tasks={managerUrgentToday}
            loading={loading}
            onOpenTask={(task) => navigation?.navigate?.('TaskDetail', { taskId: task.id })}
            style={hs.sectionGap}
          />

          {pendingDenetimler > 0 ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation?.navigate?.('Denetim')}
              style={[hs.alertBanner, hs.sectionGap]}
            >
              <KitIconBubble tone="warning" size="sm">
                <Icon.Audit size={16} color={kitPalette.warning[700]} strokeWidth={2} />
              </KitIconBubble>
              <KitText variant="bodySm" weight="SemiBold" color={kitPalette.warning[800]} style={{ flex: 1 }}>
                {pendingDenetimler === 1
                  ? '1 görev onay bekliyor'
                  : `${pendingDenetimler} görev onay bekliyor`}
              </KitText>
              <Icon.Forward size={16} color={kitPalette.warning[700]} strokeWidth={2} />
            </TouchableOpacity>
          ) : null}

          {todayOverdueCount > 0 ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() =>
                navigation?.navigate?.('ManagerTasks', {
                  initialOverdueTodayOnly: true,
                  filterRequestId: Date.now(),
                })
              }
              style={[hs.alertBannerDanger, hs.sectionGap]}
            >
              <KitIconBubble tone="danger" size="sm">
                <Icon.Warning size={16} color={kitPalette.danger[700]} strokeWidth={2} />
              </KitIconBubble>
              <KitText variant="bodySm" weight="SemiBold" color={kitPalette.danger[800]} style={{ flex: 1 }}>
                {todayOverdueCount === 1
                  ? '1 gecikmiş görev'
                  : `${todayOverdueCount} gecikmiş görev`}
              </KitText>
              <Icon.Forward size={16} color={kitPalette.danger[700]} strokeWidth={2} />
            </TouchableOpacity>
          ) : null}

          <ManagerHomeKpiStrip
            loading={loading && !managerReportJobs.length}
            kpis={managerHomeKpis}
            dateFilter={managerKpiDateFilter}
            onDateFilterChange={setManagerKpiDateFilter}
            onPressPending={() => navigation?.navigate?.('AuditCenter')}
            onPressOverdue={() =>
              navigation?.navigate?.('ManagerTasks', {
                initialOverdueTodayOnly: true,
                filterRequestId: Date.now(),
              })
            }
            onPressCompleted={() => navigateMobileRoute(navigation, 'TasksCompleted')}
            onPressAll={() => navigation?.navigate?.('ManagerTasks')}
            style={hs.sectionGap}
          />
        </>
      ) : null}

      {/* ========================== MANAGER KOLU ========================== */}
      {isManager ? (
        <>
          <LiveTaskFlowPanel
            jobs={liveFeed}
            loading={loading && !liveFeed.length}
            onOpenTask={(item) => {
              if (liveAuditShouldOpenDenetim(item?.durum)) {
                navigation?.navigate?.('Denetim', {
                  taskId: item.id,
                  openEvidence: true,
                })
              } else {
                navigation?.navigate?.('TaskDetail', { taskId: item.id })
              }
            }}
            style={hs.sectionGap}
          />

          <ManagerOperasyonOzeti
            loading={loading && !managerReportJobs.length}
            reportScope={reportScope}
            onReportScopeChange={setReportScope}
            jobs={managerReportJobs}
            style={hs.sectionGap}
          />
        </>
      ) : null}

      {!isManager ? (
        <OperatorHomeSections
          ref={operatorHomeRef}
          sectionGapStyle={hs.sectionGap}
          engagement={{
            pageLoading: loading,
            nextTask,
            monthlyNetPoints,
            gainedPointsToday,
            streakDays,
            displayName,
            recentCompleted,
            onOpenTask: openTaskDetail,
          }}
        />
      ) : null}

      {/* ───────────────────────────── MODALS ───────────────────────────── */}

      {/* Manager summary modal */}
      <KitCenterModal
        visible={managerSummaryModalVisible}
        onClose={() => setManagerSummaryModalVisible(false)}
        padding="lg"
        maxWidth={360}
      >
        <KitHeading variant="h2" style={{ marginBottom: kitSpacing.lg }}>
          Görev Tamamlama Detayı
        </KitHeading>
        <View style={hs.summaryRow}>
          <KitText variant="body" color={kitPalette.slate[500]}>
            Toplam Görev
          </KitText>
          <KitText variant="bodyLg" weight="Bold">
            {totalToday}
          </KitText>
        </View>
        <View style={hs.summaryRow}>
          <KitText variant="body" color={kitPalette.slate[500]}>
            Tamamlanan
          </KitText>
          <KitText variant="bodyLg" weight="Bold" color={kitPalette.success[700]}>
            {completedToday}
          </KitText>
        </View>
        <View style={hs.summaryRow}>
          <KitText variant="body" color={kitPalette.slate[500]}>
            Bekleyen
          </KitText>
          <KitText variant="bodyLg" weight="Bold" color={kitPalette.warning[700]}>
            {pendingToday}
          </KitText>
        </View>
        <View style={hs.summaryRow}>
          <KitText variant="body" color={kitPalette.slate[500]}>
            Onay Bekleyen
          </KitText>
          <KitText variant="bodyLg" weight="Bold" color={kitPalette.blurple[700]}>
            {pendingDenetimler}
          </KitText>
        </View>
        <View style={hs.summaryRow}>
          <KitText variant="body" color={kitPalette.slate[500]}>
            Aktif Personel
          </KitText>
          <KitText variant="bodyLg" weight="Bold">
            {activeStaffCount}/{totalStaffCount}
          </KitText>
        </View>
        <KitButton
          variant="primary"
          size="md"
          fullWidth
          onPress={() => setManagerSummaryModalVisible(false)}
          style={{ marginTop: kitSpacing.lg }}
        >
          Kapat
        </KitButton>
      </KitCenterModal>

      {/* Announcement modal */}
      <KitSheet
        visible={announcementModalVisible}
        onClose={() => setAnnouncementModalVisible(false)}
        padding="md"
      >
        <KitHeading variant="h1" style={{ marginBottom: kitSpacing.md }}>
          Hızlı Duyuru
        </KitHeading>
        <KitText variant="caption" color={kitPalette.slate[500]} style={{ marginBottom: kitSpacing.sm }}>
          BİRİMLER
        </KitText>
        <View style={hs.announceUnits}>
          {announcementUnits.map((u) => (
            <KitChip
              key={u.id}
              tone="soft"
              selected={selectedAnnouncementUnitIds.includes(u.id)}
              onPress={() => toggleAnnouncementUnit(u.id)}
              size="md"
            >
              {u.name}
            </KitChip>
          ))}
        </View>
        <KitText
          variant="caption"
          color={kitPalette.slate[500]}
          style={{ marginTop: kitSpacing.lg, marginBottom: kitSpacing.sm }}
        >
          MESAJ
        </KitText>
        <TextInput
          style={hs.announceInput}
          placeholder="Duyuru metnini yaz..."
          placeholderTextColor={kitPalette.slate[400]}
          multiline
          value={announcementText}
          onChangeText={setAnnouncementText}
        />
        <KitButton
          variant="accent"
          size="lg"
          fullWidth
          loading={announcementLoading}
          onPress={sendAnnouncement}
          style={{ marginTop: kitSpacing.lg }}
        >
          Duyuruyu Gönder
        </KitButton>
      </KitSheet>

      {/* Flashlight modal */}
      <Modal
        visible={flashlightVisible}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setFlashlightVisible(false)}
      >
        <View style={hs.cameraModal}>
          <CameraView style={StyleSheet.absoluteFill} enableTorch />
          <TouchableOpacity
            style={hs.cameraCloseBtn}
            onPress={() => setFlashlightVisible(false)}
            activeOpacity={0.85}
          >
            <KitText variant="body" weight="Bold" color={kitPalette.surface}>
              Feneri Kapat
            </KitText>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* QR modal */}
      <Modal
        visible={qrModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setQrModalVisible(false)}
      >
        <View style={hs.qrModal}>
          <View style={hs.qrSheet}>
            <CameraView
              style={hs.qrCamera}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={qrModalVisible ? handleBarcodeScanned : undefined}
            />
            <KitButton
              variant="secondary"
              size="lg"
              fullWidth
              onPress={() => setQrModalVisible(false)}
              style={{ marginTop: kitSpacing.lg }}
            >
              İptal
            </KitButton>
          </View>
        </View>
      </Modal>
    </KitScreen>

      {/* Bildirimler Modal — topbar zili ile acilir */}
      <KitCenterModal
        visible={notificationsModalVisible}
        onClose={() => setNotificationsModalVisible(false)}
        padding="lg"
        maxWidth={420}
        style={hs.notifModalSheet}
      >
        <View style={hs.notifModalBody}>
          <View style={hs.notifModalHeader}>
            <KitIconBubble tone="primary" size="md">
              <Icon.News size={18} color={kitPalette.primary[700]} strokeWidth={2} />
            </KitIconBubble>
            <View style={hs.notifHeaderCopy}>
              <KitHeading variant="h2">Bildirimler</KitHeading>
              <KitText variant="caption" color={kitPalette.slate[500]}>
                {new Date().toLocaleDateString('tr-TR')}
                {unreadNotifCount > 0
                  ? ` • ${unreadNotifCount} bekleyen`
                  : ' • Yeni bildirim yok'}
              </KitText>
            </View>
            {homeNotificationItems.length > 0 ? (
              <Pressable onPress={onMarkAllNotifsRead} hitSlop={8} style={hs.notifMarkAllBtn}>
                <Icon.Read size={14} color={kitPalette.primary[600]} strokeWidth={2.2} />
                <KitText variant="caption" weight="SemiBold" color={kitPalette.primary[600]}>
                  Tümünü okundu
                </KitText>
              </Pressable>
            ) : null}
          </View>

          {homeNotificationItems.length === 0 ? (
            <KitEmptyState
              tone="soft"
              icon={<Icon.News size={28} color={kitPalette.slate[400]} strokeWidth={1.6} />}
              title="Yeni bildirim yok"
              description={
                isManager
                  ? 'Acil görev, onay bekleyen denetim veya duyuru olduğunda burada listelenir.'
                  : 'Görev atama, çalışma durumu, süre ve gecikme uyarıları burada listelenir.'
              }
            />
          ) : (
            <ScrollView
              style={hs.notifScroll}
              contentContainerStyle={hs.notifList}
              showsVerticalScrollIndicator
              bounces
              nestedScrollEnabled
            >
              {homeNotificationItems.map((item) => {
                const tone =
                  item.tone === 'warning'
                    ? 'warning'
                    : item.tone === 'danger'
                      ? 'danger'
                      : item.tone === 'success'
                        ? 'success'
                        : item.tone === 'info'
                          ? 'info'
                          : 'soft'
                const NotifIcon = item.Icon
                return (
                  <KitCard
                    key={item.id}
                    tone={tone}
                    padding="md"
                    radius="xl"
                    style={hs.notifCard}
                  >
                    <Pressable
                      onPress={() => onPressHomeNotification(item)}
                      style={({ pressed }) => [hs.notifRow, pressed && hs.notifRowPressed]}
                    >
                      <KitIconBubble tone={tone} size="md">
                        <NotifIcon size={18} color={kitTones[tone].icon} strokeWidth={2} />
                      </KitIconBubble>
                      <View style={hs.notifTextWrap}>
                        <KitText variant="bodyLg" weight="Bold" color={kitTones[tone].text} numberOfLines={1}>
                          {item.title}
                        </KitText>
                        <KitText variant="bodySm" color={kitTones[tone].softText} numberOfLines={2}>
                          {item.detail}
                        </KitText>
                      </View>
                      <Icon.Forward size={18} color={kitTones[tone].softText} strokeWidth={2} />
                    </Pressable>
                    <KitButton
                      variant="secondary"
                      size="sm"
                      onPress={() => onMarkNotifRead(item.id)}
                      iconLeft={<Icon.Read size={14} color={kitPalette.primary[700]} strokeWidth={2.2} />}
                      style={hs.notifReadBtn}
                    >
                      Okundu
                    </KitButton>
                  </KitCard>
                )
              })}
            </ScrollView>
          )}

          <KitButton
            variant="secondary"
            size="md"
            fullWidth
            onPress={() => setNotificationsModalVisible(false)}
            style={hs.notifCloseBtn}
          >
            Kapat
          </KitButton>
        </View>
      </KitCenterModal>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const NOTIF_MODAL_MAX_HEIGHT = Dimensions.get('window').height * 0.82
const NOTIF_LIST_MAX_HEIGHT = Dimensions.get('window').height * 0.44

const hs = StyleSheet.create({
  shell: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionGap: {
    marginTop: kitSpacing.lg,
  },
  notifFab: {
    position: 'absolute',
    right: kitSpacing.lg,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: kitPalette.primary[700],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: kitPalette.primary[500],
    ...kitShadows.lg,
    zIndex: 50,
    elevation: 12,
  },
  notifBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: kitPalette.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: kitPalette.surface,
  },
  notifBadgeText: {
    fontSize: 11,
    lineHeight: 14,
  },
  notifModalSheet: {
    maxHeight: NOTIF_MODAL_MAX_HEIGHT,
  },
  notifModalBody: {
    flexShrink: 1,
  },
  notifModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.md,
    marginBottom: kitSpacing.lg,
  },
  notifHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  notifMarkAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: kitSpacing.xs,
    paddingHorizontal: kitSpacing.xs,
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: kitSpacing.md,
    paddingVertical: 6,
    borderRadius: kitRadii.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  actionQueueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.md,
    marginBottom: kitSpacing.md,
  },
  actionQueueList: {
    gap: kitSpacing.sm,
  },
  actionQueueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.md,
    paddingHorizontal: kitSpacing.md,
    paddingVertical: kitSpacing.md,
    borderRadius: kitRadii.xl,
    borderWidth: 1,
  },
  actionQueueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.md,
  },
  progressValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 4,
  },
  heroRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroWeatherPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: kitSpacing.md,
    paddingVertical: kitSpacing.xs + 2,
    borderRadius: kitRadii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    gap: 6,
  },
  heroActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: kitSpacing.sm,
    marginTop: kitSpacing.md,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.sm,
    padding: kitSpacing.md,
    borderRadius: kitRadii.xl,
    backgroundColor: kitPalette.warning[50],
    borderWidth: 1,
    borderColor: kitPalette.warning[100],
  },
  alertBannerDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.sm,
    padding: kitSpacing.md,
    borderRadius: kitRadii.xl,
    backgroundColor: kitPalette.danger[50],
    borderWidth: 1,
    borderColor: kitPalette.danger[100],
  },
  heroGhostBtn: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderColor: 'rgba(255,255,255,0.30)',
  },
  notifList: {
    gap: kitSpacing.sm,
    paddingBottom: kitSpacing.xs,
  },
  notifScroll: {
    maxHeight: NOTIF_LIST_MAX_HEIGHT,
    marginBottom: kitSpacing.sm,
  },
  notifCloseBtn: {
    marginTop: kitSpacing.md,
  },
  notifCard: {
    gap: kitSpacing.sm,
  },
  notifReadBtn: {
    alignSelf: 'stretch',
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.md,
  },
  notifRowPressed: {
    opacity: 0.88,
  },
  notifTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  focusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.md,
  },
  focusTextWrap: {
    flex: 1,
  },
  focusTitle: {
    marginVertical: 4,
  },
  focusMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: kitSpacing.sm,
    marginTop: 4,
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: kitSpacing.sm,
  },
  kpiCard: {
    flex: 1,
    minHeight: 96,
    minWidth: 0,
    paddingHorizontal: kitSpacing.sm,
    paddingVertical: kitSpacing.sm,
  },
  completionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chartWrap: {
    marginTop: kitSpacing.md,
    alignItems: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: kitSpacing.lg,
    marginTop: kitSpacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  perfHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.md,
  },
  perfAvatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: kitPalette.primary[50],
    borderWidth: 1,
    borderColor: kitPalette.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  perfValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 4,
  },
  perfTrack: {
    height: 10,
    backgroundColor: kitPalette.slate[100],
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: kitSpacing.md,
  },
  perfTrackFill: {
    height: '100%',
    backgroundColor: kitPalette.accent[500],
    borderRadius: 999,
  },
  perfMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: kitSpacing.sm,
  },
  sparkWrap: {},
  perfDivider: {
    height: 1,
    backgroundColor: kitPalette.slate[100],
    marginVertical: kitSpacing.lg,
  },
  perfMiniRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: kitSpacing.md,
  },
  perfMini: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: kitSpacing.sm,
    backgroundColor: kitPalette.slate[50],
    borderRadius: kitRadii.xl,
    borderWidth: 1,
    borderColor: kitPalette.slate[100],
    gap: 4,
  },
  recentList: {
    gap: kitSpacing.sm,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.md,
  },
  recentTextWrap: {
    flex: 1,
  },
  recentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: kitSpacing.sm,
    marginTop: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: kitSpacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: kitPalette.slate[100],
  },
  announceUnits: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: kitSpacing.sm,
  },
  announceInput: {
    minHeight: 96,
    maxHeight: 160,
    backgroundColor: kitPalette.slate[50],
    borderRadius: kitRadii.xl,
    borderWidth: 1,
    borderColor: kitPalette.slate[100],
    padding: kitSpacing.md,
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Medium',
    color: kitPalette.slate[800],
    textAlignVertical: 'top',
  },
  cameraModal: {
    flex: 1,
    backgroundColor: kitPalette.slate[900],
  },
  cameraCloseBtn: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    paddingHorizontal: kitSpacing['2xl'],
    paddingVertical: kitSpacing.md,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: kitRadii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  qrModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  qrSheet: {
    backgroundColor: kitPalette.surface,
    borderTopLeftRadius: kitRadii['3xl'],
    borderTopRightRadius: kitRadii['3xl'],
    padding: kitSpacing.lg,
    paddingBottom: kitSpacing['2xl'],
  },
  qrCamera: {
    width: '100%',
    height: 300,
    borderRadius: kitRadii['2xl'],
    overflow: 'hidden',
    backgroundColor: kitPalette.slate[900],
  },
})
