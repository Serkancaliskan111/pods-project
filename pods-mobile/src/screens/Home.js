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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import Svg, { Polyline, Line, Circle } from 'react-native-svg'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import Theme from '../theme/theme'
import {
  canCreateTasks,
  canAssignTasks,
  hasManagementPrivileges,
  isPermTruthy as isPermTruthyShared,
  isTopCompanyScope as isTopCompanyScopeShared,
} from '../lib/managementScope'
import { formatFullName } from '../lib/nameFormat'
import { DEFAULT_AVATAR_ID, getAvatarById } from '../lib/avatarTemplates'
import { loadAvatarPreference } from '../lib/avatarPreference'
import PremiumBackgroundPattern from '../components/PremiumBackgroundPattern'
import { insertPointTransaction, normalizeTaskScore } from '../lib/pointsLedger'
import {
  TASK_STATUS,
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
  normalizeTaskStatus,
} from '../lib/taskStatus'

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

function extractPhotoUrls(job) {
  if (!job) return []
  const raw =
    job.kanit_resim_ler ??
    job.kanit_fotograflari ??
    job.fotograflar ??
    job.gorseller ??
    job.resimler ??
    job.fotograf_url ??
    job.foto_url ??
    job.photo_url ??
    job.images ??
    job.image_urls ??
    job.media

  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    try {
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return parsed.filter(Boolean)
      }
    } catch {
      // ignore
    }
    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
    return [trimmed]
  }
  return []
}

function getFirstPhotoUrl(job) {
  return extractPhotoUrls(job)[0] ?? null
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
  if (t === 'zincir_gorev') return { icon: '🔗', label: 'Zincir Görev' }
  if (t === 'zincir_onay') return { icon: '✅', label: 'Zincir Onay' }
  if (t === 'zincir_gorev_ve_onay') return { icon: '🔗✅', label: 'Zincir + Onay' }
  return null
}

function mapWeatherEmojiFromCode(code) {
  if (code == null) return '☀️'
  const c = Number(code)
  if ([0, 1].includes(c)) return '☀️'
  if ([2, 3, 45, 48].includes(c)) return '☁️'
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(c)) return '🌧️'
  if ([71, 73, 75, 77, 85, 86].includes(c)) return '❄️'
  if ([95, 96, 99].includes(c)) return '⛈️'
  return '🌤️'
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

export default function Home({ onOpenTask }) {
  const navigation = useNavigation()
  const route = useRoute()
  const { user, personel, permissions, loading: authLoading } = useAuth()
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
  const recentAnimValues = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current

  const isPermTruthy = useCallback((key) => isPermTruthyShared(permissions, key), [permissions])
  const canAssignTask = canAssignTasks(permissions, personel)
  const canCreateTask = canCreateTasks(permissions)
  const isManager = hasManagementPrivileges(permissions, personel)
  const isTopCompanyScope = isTopCompanyScopeShared(personel, permissions)
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
  const unitName = resolvedUnitName || (personel?.birim_id ? 'Birim' : 'Birim Atanmamış')
  const companyName = resolvedCompanyName || 'Şirket'
  const selectedAvatar = useMemo(() => getAvatarById(selectedAvatarId), [selectedAvatarId])
  const sparklinePoints = useMemo(() => {
    const width = 220
    const height = 36
    const values = Array.isArray(weeklyTrend) && weeklyTrend.length ? weeklyTrend : [0, 0, 0, 0, 0, 0, 0]
    const max = Math.max(...values, 1)
    return values
      .map((v, i) => {
        const x = (i * width) / Math.max(values.length - 1, 1)
        const y = height - (Math.max(0, Number(v) || 0) / max) * height
        return `${x},${y}`
      })
      .join(' ')
  }, [weeklyTrend])
  const rejectedToday = Math.max(0, totalToday - completedToday - pendingToday)
  const completionPercent = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0
  const rejectPercent = totalToday > 0 ? Math.round((rejectedToday / totalToday) * 100) : 0
  const pendingPercent = totalToday > 0 ? Math.round((pendingToday / totalToday) * 100) : 0
  const managerGraph = useMemo(() => {
    const xMin = 12
    const xMax = 252
    const yBase = 76
    const chartHeight = 68
    const x = [xMin, xMin + (xMax - xMin) * 0.5, xMax]
    const completionY = [yBase, yBase - (completionPercent / 100) * chartHeight, yBase - (completionPercent / 100) * chartHeight]
    const rejectY = [yBase, yBase - (rejectPercent / 100) * chartHeight, yBase - (rejectPercent / 100) * chartHeight]
    const pendingY = [yBase, yBase - (pendingPercent / 100) * chartHeight, yBase - (pendingPercent / 100) * chartHeight]
    return {
      x,
      completionY,
      rejectY,
      pendingY,
      completion: `${x[0]},${completionY[0]} ${x[1]},${completionY[1]} ${x[2]},${completionY[2]}`,
      reject: `${x[0]},${rejectY[0]} ${x[1]},${rejectY[1]} ${x[2]},${rejectY[2]}`,
      pending: `${x[0]},${pendingY[0]} ${x[1]},${pendingY[1]} ${x[2]},${pendingY[2]}`,
    }
  }, [completionPercent, rejectPercent, pendingPercent])

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
        const { data: companyData } = await supabase
          .from('ana_sirketler')
          .select('ana_sirket_adi')
          .eq('id', personel.ana_sirket_id)
          .maybeSingle()

        if (mounted) {
          setResolvedCompanyName(companyData?.ana_sirket_adi || null)
        }

        if (!personel?.birim_id) {
          if (mounted) setResolvedUnitName(null)
          return
        }

        const { data: unitData } = await supabase
          .from('birimler')
          .select('birim_adi')
          .eq('id', personel.birim_id)
          .eq('ana_sirket_id', personel.ana_sirket_id)
          .maybeSingle()

        if (mounted) {
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
        if (!isTopCompanyScope && personel?.birim_id) {
          todayQuery = todayQuery.eq('birim_id', personel.birim_id)
        }
      } else {
        todayQuery = todayQuery.eq('sorumlu_personel_id', personel.id)
      }

      const { data: todayData, error: todayError } = await todayQuery

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
        const todayList = todayData ? JSON.parse(JSON.stringify(todayData)) : []
        setTotalToday(todayList.length)
        const completedList = todayList.filter((t) => isCompleted(t?.durum))
        const pendingList = todayList.filter((t) => !isCompleted(t?.durum))
        setCompletedToday(completedList.length)
        setPendingToday(pendingList.length)
        // Acil görev sayısı: manager için kapsam genelinde, personel için kendisi.
        setUrgentCountToday(0)
        setUrgentTaskToOpen(null)

        // Tarih filtresinden bağımsız: aktif (tamamlanmamış) acil görev var mı?
        try {
          let urgentQuery = supabase
            .from('isler')
            .select('id, baslik, durum, acil, created_at')
            .eq('ana_sirket_id', personel.ana_sirket_id)
            .eq('acil', true)
              .gte('created_at', dayStartIso)
              .lt('created_at', dayEndIso)
            .order('created_at', { ascending: true })
            .limit(20)
          if (!isManager) {
            urgentQuery = urgentQuery.eq('sorumlu_personel_id', personel.id)
          }

          if (!isTopCompanyScope && personel?.birim_id) {
            urgentQuery = urgentQuery.eq('birim_id', personel.birim_id)
          }

          const { data: urgentRows } = await urgentQuery
          const activeUrgents = (urgentRows || []).filter((t) => !!t?.acil && !isCompleted(t?.durum))
          setUrgentCountToday(activeUrgents.length)
          setUrgentTaskToOpen(activeUrgents[0] || null)
        } catch {
          // best-effort: bugün aralığından hesaplanana geri dön
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

            if (!isTopCompanyScope && personel?.birim_id) {
              pendingQuery = pendingQuery.eq('birim_id', personel.birim_id)
            }

            const { count } = await pendingQuery
            setPendingDenetimler(Number(count) || 0)
          } catch {
            setPendingDenetimler(0)
          }

          try {
            let annQuery = supabase
              .from('duyurular')
              .select('id', { count: 'exact', head: true })
              .eq('ana_sirket_id', personel.ana_sirket_id)
              .gte('created_at', dayStartIso)
              .lt('created_at', dayEndIso)
            if (!isTopCompanyScope && personel?.birim_id) {
              annQuery = annQuery.contains('hedef_birim_ids', [personel.birim_id])
            }
            const { count: annCount } = await annQuery
            setTodayAnnouncementCount(Number(annCount) || 0)
          } catch {
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

            if (!isTopCompanyScope && personel?.birim_id) {
              weekQuery = weekQuery.eq('birim_id', personel.birim_id)
            }

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
        if (!isTopCompanyScope && personel?.birim_id) {
          recentQuery = recentQuery.eq('birim_id', personel.birim_id)
        }
      } else {
        recentQuery = recentQuery.eq('sorumlu_personel_id', personel.id)
        if (!isTopCompanyScope && personel?.birim_id) {
          recentQuery = recentQuery.eq('birim_id', personel.birim_id)
        }
      }

      const { data: son3Data, error: son3Error } = await recentQuery

      if (!son3Error && son3Data) {
        const visibleRecent = await filterByOnaySirasi(son3Data)
        setRecentCompleted(JSON.parse(JSON.stringify(visibleRecent)))
      } else {
        setRecentCompleted([])
      }

      // Personel gamification: günlük seri + son 7 gün puan trendi
      try {
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

        if (!isTopCompanyScope && personel?.birim_id) {
          trendQuery = trendQuery.eq('birim_id', personel.birim_id)
        }

        const { data: trendRows } = await trendQuery
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

      const liveStatuses = [
        TASK_STATUS.APPROVED,
        TASK_STATUS.PENDING_APPROVAL,
        TASK_STATUS.RESUBMITTED,
      ]
      let feedQuery = supabase
        .from('isler')
        .select('id, baslik, durum, updated_at, created_at, kanit_resim_ler, checklist_cevaplari, sorumlu_personel_id, aciklama, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim')
        .eq('ana_sirket_id', personel.ana_sirket_id)
        .in('durum', liveStatuses)
        .gte('updated_at', dayStartIso)
        .lt('updated_at', dayEndIso)
        .order('updated_at', { ascending: false })
        .limit(5)

      if (isManager && !isTopCompanyScope && personel?.birim_id) {
        feedQuery = feedQuery.eq('birim_id', personel.birim_id)
      }
      if (!isManager) {
        feedQuery = feedQuery.eq('sorumlu_personel_id', personel.id)
      }

      const { data: feedData, error: feedErr } = await feedQuery
      if (!feedErr && feedData) {
        const visibleFeed = await filterByOnaySirasi(feedData)
        const baseFeed = JSON.parse(JSON.stringify(visibleFeed))
        const chainTaskIds = baseFeed
          .filter((row) => {
            const t = String(row?.gorev_turu || '').toLowerCase()
            return t === 'zincir_gorev' || t === 'zincir_gorev_ve_onay'
          })
          .map((row) => row?.id)
          .filter(Boolean)

        if (chainTaskIds.length) {
          const { data: stepRows } = await supabase
            .from('isler_zincir_gorev_adimlari')
            .select('is_id, adim_no, durum, kanit_resim_ler')
            .in('is_id', chainTaskIds)
            .order('adim_no', { ascending: false })

          const latestStepPhotosByTask = {}
          for (const step of stepRows || []) {
            const taskId = String(step?.is_id || '')
            if (!taskId || latestStepPhotosByTask[taskId]) continue
            const photos = extractPhotoUrls(step)
            if (!photos.length) continue
            latestStepPhotosByTask[taskId] = photos
          }

          for (const row of baseFeed) {
            const taskId = String(row?.id || '')
            if (!taskId) continue
            const existing = extractPhotoUrls(row)
            if (existing.length) continue
            const stepPhotos = latestStepPhotosByTask[taskId]
            if (stepPhotos?.length) {
              row.kanit_resim_ler = stepPhotos
            }
          }
        }
        const withThumb = baseFeed.map((row) => {
          const existingThumb = getFirstPhotoUrl(row)
          if (existingThumb) return { ...row, thumb_url: existingThumb }
          const checklistRows = Array.isArray(row?.checklist_cevaplari) ? row.checklist_cevaplari : []
          for (const ans of checklistRows) {
            const photos = Array.isArray(ans?.fotograflar) ? ans.fotograflar : []
            if (photos.length) return { ...row, thumb_url: photos[0] }
          }
          return { ...row, thumb_url: null }
        })

        const personelIds = [...new Set(withThumb.map((f) => f?.sorumlu_personel_id).filter(Boolean))]
        if (personelIds.length) {
          let personelMapQuery = supabase
            .from('personeller')
            .select('id, ad, soyad')
            .eq('ana_sirket_id', personel.ana_sirket_id)
            .in('id', personelIds)
          if (isManager && !isTopCompanyScope && personel?.birim_id) {
            personelMapQuery = personelMapQuery.eq('birim_id', personel.birim_id)
          }
          const { data: peopleRows } = await personelMapQuery
          const map = {}
          ;(peopleRows || []).forEach((p) => {
            map[String(p.id)] = formatFullName(p.ad, p.soyad, 'Personel')
          })
          setLiveFeed(
            withThumb.map((item) => ({
              ...item,
              sorumlu_personel_adi: map[String(item?.sorumlu_personel_id)] || 'Personel',
            })),
          )
        } else {
          setLiveFeed(withThumb)
        }
      } else {
        setLiveFeed([])
      }

      const nowIso = new Date().toISOString()
      const isManagerOverdueTask = (task) => {
        const durum = normalizeTaskStatus(task?.durum)
        const dueIso = task?.son_tarih
        if (!dueIso) return false
        if (String(dueIso) < String(dayStartIso)) return false
        if (String(dueIso) >= nowIso) return false
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

      // AlertBar: manager için süresi geçmiş açık işler, personel için revize işleri.
      try {
        if (isManager) {
          let overdueQuery = supabase
            .from('isler')
            .select('id, durum, son_tarih, created_at, updated_at, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim')
            .eq('ana_sirket_id', personel.ana_sirket_id)
            .gte('created_at', dayStartIso)
            .lt('created_at', dayEndIso)
            .gte('son_tarih', dayStartIso)
            .lt('son_tarih', nowIso)
            .order('son_tarih', { ascending: true })
            .limit(80)

          if (!isTopCompanyScope && personel?.birim_id) {
            overdueQuery = overdueQuery.eq('birim_id', personel.birim_id)
          }

          const { data: overdueRows } = await overdueQuery
          const visibleOverdueRows = await filterByOnaySirasi(overdueRows || [])
          const notCompleted = (visibleOverdueRows || []).filter(isManagerOverdueTask)
          const overdueCount = notCompleted.length
          setTodayOverdueCount(overdueCount)
          if (overdueCount > 0) {
            setAlertMessage(`⚠️ Dikkat: Süresi geçen ${overdueCount} adet iş bulunuyor!`)
          } else {
            setAlertMessage(null)
          }
        } else {
          setTodayOverdueCount(0)
          let rejectedQuery = supabase
            .from('isler')
            .select('id, durum')
            .eq('ana_sirket_id', personel.ana_sirket_id)
            .eq('sorumlu_personel_id', personel.id)
            .gte('created_at', dayStartIso)
            .lt('created_at', dayEndIso)
            .order('created_at', { ascending: false })
            .limit(20)
          const { data: rejectedRows } = await rejectedQuery

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
            setAlertMessage(rejectedCount === 1 ? '1 İşin Revize Edilmeli!' : `${rejectedCount} İşin Revize Edilmesi Gerekiyor!`)
          } else {
            setAlertMessage(null)
          }
        }
      } catch {
        setTodayOverdueCount(0)
        setAlertMessage(null)
      }

      // Focus Widget:
      // - manager: sadece bugün onay bekleyen kritik işi göster.
      // - personel: sıradaki görev göster.
      try {
        if (isManager) {
          let focusQuery = supabase
            .from('isler')
            .select('id, baslik, son_tarih, created_at, durum, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim')
            .eq('ana_sirket_id', personel.ana_sirket_id)
            .gte('created_at', dayStartIso)
            .lt('created_at', dayEndIso)
            .in('durum', [TASK_STATUS.PENDING_APPROVAL, TASK_STATUS.RESUBMITTED])
            .order('created_at', { ascending: true })
            .limit(10)

          if (!isTopCompanyScope && personel?.birim_id) {
            focusQuery = focusQuery.eq('birim_id', personel.birim_id)
          }

          const { data: focusData, error: focusErr } = await focusQuery
          if (!focusErr && focusData?.length) {
            const visibleFocus = await filterByOnaySirasi(focusData)
            setNextTask(visibleFocus?.[0] || null)
            setManagerFocusMode(visibleFocus?.[0] ? 'approval' : null)
          } else {
            setNextTask(null)
            setManagerFocusMode(null)
          }
        } else {
          // Personel focus: sıradaki görev.
          let focusQuery = supabase
            .from('isler')
            .select('id, baslik, son_tarih, created_at, durum, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim')
            .eq('ana_sirket_id', personel.ana_sirket_id)
            .eq('sorumlu_personel_id', personel.id)
            .gte('created_at', dayStartIso)
            .lt('created_at', dayEndIso)
            .order('son_tarih', { ascending: true, nullsFirst: false })
            .limit(10)

          const { data: focusRows, error: focusErr } = await focusQuery
          if (focusErr) {
            setNextTask(null)
            return
          }
          const visibleFocusRows = await filterByOnaySirasi(focusRows || [])

          // Personel, onay/review durumlarındaki işleri görmesin.
          const allowedRow = (visibleFocusRows || []).find((t) => {
            return (
              !isCompleted(t?.durum) &&
              !isPendingApprovalTaskStatus(t?.durum)
            )
          })

          setNextTask(allowedRow || null)
          setManagerFocusMode(null)
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
          if (!isTopCompanyScope && personel?.birim_id) {
            staffQuery = staffQuery.eq('birim_id', personel.birim_id)
          }
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
            if (!isTopCompanyScope && personel?.birim_id) {
              activeQuery = activeQuery.eq('birim_id', personel.birim_id)
            }
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
        if (!isTopCompanyScope && personel?.birim_id) {
          peopleQuery = peopleQuery.eq('birim_id', personel.birim_id)
        }
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
                if (!userId) return [pid, getAvatarById(DEFAULT_AVATAR_ID)?.emoji || '👤']
                const pref = await loadAvatarPreference(userId)
                return [pid, getAvatarById(pref)?.emoji || getAvatarById(DEFAULT_AVATAR_ID)?.emoji || '👤']
              }),
            )
            const avatarMap = Object.fromEntries(avatarRows)

            const maxPoints = Math.max(...topIds.map((pid) => Number(totals[pid] || 0)), 1)
            setLeaderboardTop(
              topIds.map((pid, idx) => ({
                id: pid,
                rank: idx + 1,
                name: nameMap[pid] || 'Personel',
                points: totals[pid] || 0,
                companyName: 'Şirket',
                unitName: unitNameMap[String(unitIdMap[pid])] || 'Birim',
                avatarEmoji: avatarMap[pid] || '👤',
                progressPercent: Math.min(100, Math.round(((Number(totals[pid] || 0)) / maxPoints) * 100)),
              })),
            )
          }
        }
      } catch {
        setLeaderboardTop([])
      }

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

          if (!isTopCompanyScope && personel?.birim_id) {
            overdueQuery = overdueQuery.eq('birim_id', personel.birim_id)
          }

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

            const tx = await insertPointTransaction({
              personelId: personel.id,
              delta: penalty,
              tarih: task?.son_tarih || undefined,
              gorevId: task.id,
              gorevBaslik,
              islemTipi: 'TASK_DELAY_PENALTY',
              aciklama: note,
            })

            if (!tx?.ok) continue

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
    isManager,
    isTopCompanyScope,
    dateFilter,
  ])

  const loadAvatarChoice = useCallback(async () => {
    if (!user?.id) {
      setSelectedAvatarId(DEFAULT_AVATAR_ID)
      return
    }
    const avatarId = await loadAvatarPreference(user.id)
    setSelectedAvatarId(avatarId || DEFAULT_AVATAR_ID)
  }, [user?.id])

  useEffect(() => {
    loadAvatarChoice()
  }, [loadAvatarChoice])

  useFocusEffect(
    useCallback(() => {
      if (!user?.id || authLoading) return
      load()
      loadAvatarChoice()
    }, [user?.id, authLoading, load, loadAvatarChoice])
  )

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    load()
  }, [load])

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
    if (!isTopCompanyScope && personel?.birim_id) {
      unitQuery = unitQuery.eq('id', personel.birim_id)
    }
    const { data } = await unitQuery
    const units = (data || []).map((u) => ({ id: u.id, name: u.birim_adi || 'Birim' }))
    setAnnouncementUnits(units)
    setSelectedAnnouncementUnitIds(units.map((u) => u.id))
  }, [personel?.ana_sirket_id, personel?.birim_id, isTopCompanyScope])

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
    loadLiveWeather()
    const timer = setInterval(loadLiveWeather, 15 * 60 * 1000)
    return () => {
      mounted = false
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

      // Hedef personelleri birim bazında çek
      const { data: targets } = await supabase
        .from('personeller')
        .select('id, ad, soyad, birim_id')
        .eq('ana_sirket_id', personel.ana_sirket_id)
        .in('birim_id', normalizedUnitIds)
        .is('silindi_at', null)

      const targetIds = (targets || []).map((t) => t.id).filter(Boolean)
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
        icon: '⚠️',
        title: 'Gecikme Uyarısı',
        detail: alertMessage,
        tone: 'warning',
      })
    }
    if (urgentCountToday > 0) {
      items.push({
        id: 'urgent_today',
        icon: '🚨',
        title: 'Bugünün Acil Görevleri',
        detail: urgentCountToday === 1 ? '1 acil görev aktif' : `${urgentCountToday} acil görev aktif`,
        tone: 'danger',
      })
    }
    if (pendingDenetimler > 0) {
      items.push({
        id: 'audit_waiting',
        icon: '🕵️',
        title: 'Denetim Bekleyen',
        detail: pendingDenetimler === 1 ? '1 iş onay bekliyor' : `${pendingDenetimler} iş onay bekliyor`,
        tone: 'info',
      })
    }
    if (todayAnnouncementCount > 0) {
      items.push({
        id: 'announcement_today',
        icon: '📣',
        title: 'Bugünkü Duyurular',
        detail: todayAnnouncementCount === 1 ? '1 duyuru yayınlandı' : `${todayAnnouncementCount} duyuru yayınlandı`,
        tone: 'neutral',
      })
    }
    if (!items.length) {
      items.push({
        id: 'all_clear',
        icon: '✅',
        title: 'Bugün Bildirim Yok',
        detail: 'Sistem akışı stabil. Yeni bir gelişme olduğunda burada görünür.',
        tone: 'success',
      })
    }
    return items.slice(0, 4)
  }, [isManager, alertMessage, urgentCountToday, pendingDenetimler, todayAnnouncementCount])
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

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size={36} color={CORPORATE_NAVY} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <PremiumBackgroundPattern />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroGradientA} />
          <View style={styles.heroGradientB} />
          <View style={styles.heroInner}>
            <View style={styles.heroRow}>
              <View style={styles.heroTextWrap}>
                <Text style={styles.heroGreeting}>Merhaba {displayName} 👋 </Text>
                <Text style={styles.heroSub}>{getTodayDateString()}</Text>
              </View>
              <View style={styles.heroIconWrap}>
                <Text style={styles.weatherIconText}>{mapWeatherEmojiFromCode(weatherCode)}</Text>
                <Text style={styles.weatherTemp}>
                  {Number.isFinite(weatherTemp) ? `${weatherTemp}°` : '--°'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {urgentCountToday > 0 ? (
          <TouchableOpacity
            style={styles.urgentBar}
            activeOpacity={0.85}
            onPress={() => {
              const id = urgentTaskToOpen?.id
              if (!id) return
              navigation?.navigate?.('TaskDetail', { taskId: id })
            }}
          >
            <Text style={styles.urgentIcon}>🚨</Text>
            <Text style={styles.urgentText} numberOfLines={2}>
              {urgentTaskToOpen?.baslik ? `Acil: ${String(urgentTaskToOpen.baslik)}` : `${urgentCountToday} acil görev`}
            </Text>
          </TouchableOpacity>
        ) : null}

        {isManager ? (
          <View style={styles.managerNotificationsSection}>
            <View style={styles.managerSectionHeaderRow}>
              <Text style={styles.sectionTitle}>Bugünün Bildirimleri</Text>
              <Text style={styles.managerSectionCaption}>{new Date().toLocaleDateString('tr-TR')}</Text>
            </View>
            {managerNotifications.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.managerNotificationCard,
                  item.tone === 'warning' && styles.managerNotificationCardWarning,
                  item.tone === 'danger' && styles.managerNotificationCardDanger,
                  item.tone === 'info' && styles.managerNotificationCardInfo,
                  item.tone === 'success' && styles.managerNotificationCardSuccess,
                ]}
                activeOpacity={0.84}
                onPress={() => onPressManagerNotification(item.id)}
              >
                <Text style={styles.managerNotificationIcon}>{item.icon}</Text>
                <View style={styles.managerNotificationTextWrap}>
                  <Text style={styles.managerNotificationTitle}>{item.title}</Text>
                  <Text style={styles.managerNotificationDetail} numberOfLines={2}>
                    {item.detail}
                  </Text>
                </View>
                <Text style={styles.managerNotificationChevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {isManager ? (
          <View style={styles.liveAuditSection}>
            <Text style={styles.sectionTitle}>Canlı Saha Denetimi</Text>
            {liveFeed.length === 0 ? (
              <Text style={styles.emptyRecent}>Harika! Bekleyen denetim kalmadı ☕</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.auditScroll}
              >
                {liveFeed.map((item) => {
                  const thumb = item?.thumb_url || getFirstPhotoUrl(item)
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.auditFeedCard}
                      activeOpacity={0.7}
                      onPress={() => {
                        const status = String(item?.durum || '').toLowerCase()
                        const shouldOpenAudit = status.includes('onay bekliyor') || status.includes('tekrar')
                        if (shouldOpenAudit) {
                          navigation?.navigate?.('Denetim', { taskId: item.id, openEvidence: true })
                        } else {
                          navigation?.navigate?.('TaskDetail', { taskId: item.id })
                        }
                      }}
                    >
                      {thumb ? (
                        <Image
                          source={{ uri: thumb }}
                          style={styles.auditThumb}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.auditThumbFallback}>
                          <Text style={styles.auditThumbFallbackText}>No Foto</Text>
                        </View>
                      )}
                      <View style={styles.auditTextWrap}>
                        <Text style={styles.auditTitle} numberOfLines={1}>
                          {item.baslik || 'İş'}
                        </Text>
                        <Text style={styles.auditPerson} numberOfLines={1}>
                          {item.sorumlu_personel_adi || 'Personel'}
                        </Text>
                        <View style={styles.auditBottomRow}>
                          <View
                            style={[
                              styles.auditStatusChip,
                              mapAuditStatusMeta(item?.durum).color === 'success' && styles.auditStatusChipSuccess,
                              mapAuditStatusMeta(item?.durum).color === 'accent' && styles.auditStatusChipAccent,
                              mapAuditStatusMeta(item?.durum).color === 'pending' && styles.auditStatusChipPending,
                            ]}
                          >
                            <Text style={styles.auditStatusChipText}>
                              {mapAuditStatusMeta(item?.durum).label}
                            </Text>
                          </View>
                          <Text style={styles.auditDate}>
                            {item.updated_at ? new Date(item.updated_at).toLocaleDateString('tr-TR') : ''}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            )}
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.focusWidget, !nextTask && styles.focusWidgetDone]}
          activeOpacity={0.8}
          disabled={!hasFocusTask}
          onPress={() => {
            if (!hasFocusTask) return
            if (isManager) {
              navigation?.navigate?.('Denetim', { taskId: nextTask.id, openEvidence: true })
              return
            }
            openTaskDetail(nextTask.id)
          }}
        >
          <View style={[styles.focusAccent, !nextTask && styles.focusAccentDone]} />
          <View style={styles.focusContent}>
            <Text style={styles.focusTitle}>
              {isManager
                ? 'Kritik Onay Bekleyen'
                : 'Sıradaki Görevin'}
            </Text>
            <Text style={styles.focusTask} numberOfLines={1}>
              {nextTask?.baslik ||
                (isManager
                  ? 'Onay bekleyen kritik iş yok'
                  : 'Görevlerini tamamladın')}
            </Text>
            {nextTask?.gorev_turu ? (
              <View style={styles.chainTypePill}>
                <Text style={styles.chainTypePillText}>
                  {mapGorevTuruBadge(nextTask.gorev_turu)?.icon || '📌'}{' '}
                  {mapGorevTuruBadge(nextTask.gorev_turu)?.label || 'Standart'}
                </Text>
              </View>
            ) : null}
            <Text style={styles.focusDate}>
              {focusSubtitleManager}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.statsBlock}>
          {isManager ? (
            <View style={styles.managerCompletionCard}>
              <Text style={styles.managerCompletionTitle}>İş Tamamlama Durumu</Text>
              <View style={styles.managerGraphWrap}>
                <Svg width={260} height={84} viewBox="0 0 260 84">
                  <Line x1="12" y1="8" x2="12" y2="76" stroke={Colors.alpha.gray35} strokeWidth="1" />
                  <Line x1="12" y1="76" x2="252" y2="76" stroke={Colors.alpha.gray35} strokeWidth="1" />
                  <Line x1="12" y1="42" x2="252" y2="42" stroke={Colors.alpha.gray20} strokeWidth="1" />
                  <Line x1="12" y1="24" x2="252" y2="24" stroke={Colors.alpha.gray20} strokeWidth="1" />
                  <Polyline points={managerGraph.completion} fill="none" stroke={Colors.success} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
                  <Polyline points={managerGraph.reject} fill="none" stroke={Colors.error} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
                  <Polyline points={managerGraph.pending} fill="none" stroke={Colors.accent} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
                  <Circle cx={managerGraph.x[2]} cy={managerGraph.completionY[2]} r={3.8} fill={Colors.success} />
                  <Circle cx={managerGraph.x[2]} cy={managerGraph.rejectY[2]} r={3.8} fill={Colors.error} />
                  <Circle cx={managerGraph.x[2]} cy={managerGraph.pendingY[2]} r={3.8} fill={Colors.accent} />
                </Svg>
                <View style={styles.managerGraphAxisLabels}>
                  <Text style={styles.managerGraphAxisText}>Başlangıç</Text>
                  <Text style={styles.managerGraphAxisText}>Orta</Text>
                  <Text style={styles.managerGraphAxisText}>Bugün</Text>
                </View>
              </View>
              <View style={styles.managerLegendRow}>
                <Text style={styles.managerLegendItem}>🟢 Tamamlama %{completionPercent}</Text>
                <Text style={styles.managerLegendItem}>🔴 Red %{rejectPercent}</Text>
                <Text style={styles.managerLegendItem}>🟠 Bekleyen %{pendingPercent}</Text>
              </View>
              <Text style={styles.managerCompletionMeta}>
                {completionPercent}% • {completedToday}/{totalToday} iş tamamlandı
              </Text>
              <TouchableOpacity
                style={styles.managerDetailBtn}
                activeOpacity={0.8}
                onPress={() => setManagerSummaryModalVisible(true)}
              >
                <Text style={styles.managerDetailBtnText}>Detay Gör</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {!isManager ? (
            <View style={styles.dailyPerformanceBlock}>
              <View style={styles.performanceHeaderRow}>
                <View style={styles.performanceIdentityRow}>
                  <View style={styles.personAvatar}>
                    <Text style={styles.personAvatarEmoji}>{selectedAvatar?.emoji || '👤'}</Text>
                  </View>
                  <Text style={styles.performanceHello} numberOfLines={1}>
                    {displayName || 'Personel'}
                  </Text>
                </View>
                <View style={styles.rankPill}>
                  <Text style={styles.rankPillText} numberOfLines={2}>
                    {unitName} - {companyName}
                  </Text>
                </View>
              </View>

              <View style={styles.performanceHeroRow}>
                <View style={styles.performanceMetricCol}>
                  <Text style={styles.performanceMetricValue}>{Math.round(monthlyNetPoints)}</Text>
                  <Text style={styles.performanceMetricTarget}>/ {DAILY_TARGET_POINTS} Puan Hedefi</Text>
                  <View style={styles.heroProgressTrack}>
                    <View style={[styles.heroProgressFill, { width: `${personalPointsPercent}%` }]} />
                  </View>
                  <Text style={styles.heroProgressPercent}>%{personalPointsPercent}</Text>
                  {completedDailyGoal ? (
                    <View style={styles.goalDonePill}>
                      <Text style={styles.goalDonePillText}>Hedef Tamamlandı</Text>
                    </View>
                  ) : null}
                  {streakDays >= 2 ? (
                    <View style={styles.streakPill}>
                      <Text style={styles.streakIcon}>🔥</Text>
                      <Text style={styles.streakText}>Başarı Serisi: {streakDays} gün</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={styles.performanceDivider} />

              <View style={styles.performanceSummaryRow}>
                <View style={styles.summaryMiniCard}>
                  <Text style={styles.summaryMiniIcon}>📋</Text>
                  <Text style={styles.summaryMiniValue}>{myTotalToday}</Text>
                  <Text style={styles.summaryMiniLabel}>TOPLAM</Text>
                </View>
                <View style={styles.summaryMiniCard}>
                  <Text style={styles.summaryMiniIcon}>✅</Text>
                  <Text style={styles.summaryMiniValue}>{myCompletedToday}</Text>
                  <Text style={styles.summaryMiniLabel}>BİTEN</Text>
                </View>
                <View style={styles.summaryMiniCard}>
                  <Text style={styles.summaryMiniIcon}>🕒</Text>
                  <Text style={styles.summaryMiniValue}>{myPendingToday}</Text>
                  <Text style={styles.summaryMiniLabel}>KALAN</Text>
                </View>
              </View>

              <View style={styles.sparklineWrap}>
                <Svg width={220} height={36} viewBox="0 0 220 36">
                  <Polyline
                    points={sparklinePoints}
                    fill="none"
                    stroke={Colors.primary}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </Svg>
              </View>
            </View>
          ) : null}
        </View>

        {isManager ? (
          <View style={styles.leaderboardWidget}>
            <Text style={styles.sectionTitle}>Bugünün En İyileri</Text>
            {leaderboardTop.length === 0 ? (
              <Text style={styles.emptyRecent}>Bugün için veri yok.</Text>
            ) : (
              leaderboardTop.map((item) => (
                <View key={item.id} style={styles.leaderboardRowCard}>
                  <View style={styles.leaderboardAvatar}>
                    <Text style={styles.leaderboardAvatarText}>{item.avatarEmoji || '👤'}</Text>
                  </View>
                  <View style={styles.leaderboardMainCol}>
                    <View style={styles.leaderboardTopLine}>
                      <Text style={styles.leaderboardName} numberOfLines={1}>{item.rank}. {item.name}</Text>
                      <Text style={styles.leaderboardPoints}>{item.points} p</Text>
                    </View>
                    <Text style={styles.leaderboardMeta} numberOfLines={1}>
                      {item.companyName} - {item.unitName}
                    </Text>
                    <View style={styles.leaderboardProgressTrack}>
                      <View style={[styles.leaderboardProgressFill, { width: `${item.progressPercent || 0}%` }]} />
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : null}

        {!isManager ? (
          <>
            <View style={styles.sentSectionTitleWrap}>
              <Text style={styles.sentSectionTitle}>Son Gönderilen İşler</Text>
            </View>
            {recentCompleted.length === 0 ? (
              <Text style={styles.emptyRecent}>Harika! Bugün seni bekleyen iş yok ☕</Text>
            ) : (
              recentCompleted.map((item, idx) => {
                const statusMeta = mapRecentStatusMeta(item?.durum)
                const anim = recentAnimValues[Math.min(idx, recentAnimValues.length - 1)]
                const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] })
                const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] })
                return (
                  <Animated.View key={item.id} style={{ opacity: anim, transform: [{ translateY }, { scale }] }}>
                    <TouchableOpacity
                      style={[
                        styles.recentCard,
                        statusMeta.tone === 'approved' && styles.recentCardApproved,
                        statusMeta.tone === 'pending' && styles.recentCardPending,
                        statusMeta.tone === 'rejected' && styles.recentCardRejected,
                      ]}
                      onPress={() => openTaskDetail(item.id)}
                      activeOpacity={0.82}
                    >
                      <View style={styles.recentTitleRow}>
                        <Text style={styles.recentTitle} numberOfLines={1}>
                          {item.baslik != null && item.baslik !== '' ? String(item.baslik) : 'İş'}
                        </Text>
                        {mapGorevTuruBadge(item?.gorev_turu) ? (
                          <View style={styles.chainTypeChip}>
                            <Text style={styles.chainTypeChipText}>
                              {mapGorevTuruBadge(item?.gorev_turu)?.icon}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.recentMetaRow}>
                        <View style={styles.recentMetaLeft}>
                        <View
                          style={[
                            styles.recentMetaPill,
                            statusMeta.tone === 'approved' && styles.recentMetaPillApproved,
                            statusMeta.tone === 'pending' && styles.recentMetaPillPending,
                            statusMeta.tone === 'rejected' && styles.recentMetaPillRejected,
                          ]}
                        >
                          <Text style={styles.recentMetaPillText}>{statusMeta.label}</Text>
                        </View>
                        {item.bitis_tarihi || item.updated_at ? (
                          <Text style={styles.recentDate}>
                            {new Date(item.bitis_tarihi || item.updated_at).toLocaleDateString('tr-TR')}
                          </Text>
                        ) : null}
                        </View>
                        <Text style={styles.recentStatusEmoji}>
                          {statusMeta.tone === 'approved' ? '✅' : statusMeta.tone === 'pending' ? '⏳' : '❌'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                )
              })
            )}
          </>
        ) : null}

      </ScrollView>

      <Modal
        visible={managerSummaryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setManagerSummaryModalVisible(false)}
      >
        <Pressable style={styles.managerModalBackdrop} onPress={() => setManagerSummaryModalVisible(false)}>
          <Pressable style={styles.managerModalSheet} onPress={() => {}}>
            <Text style={styles.managerModalTitle}>İş Tamamlama Detayı</Text>
            <Text style={styles.managerModalRow}>Toplam İş: {totalToday}</Text>
            <Text style={styles.managerModalRow}>Tamamlanan: {completedToday}</Text>
            <Text style={styles.managerModalRow}>Bekleyen: {pendingToday}</Text>
            <Text style={styles.managerModalRow}>Onay Bekleyen: {pendingDenetimler}</Text>
            <Text style={styles.managerModalRow}>Aktif Personel: {activeStaffCount}/{totalStaffCount}</Text>
            <TouchableOpacity
              style={styles.managerModalCloseBtn}
              onPress={() => setManagerSummaryModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.managerModalCloseText}>Kapat</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={announcementModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAnnouncementModalVisible(false)}
      >
        <Pressable style={styles.announceBackdrop} onPress={() => setAnnouncementModalVisible(false)}>
          <Pressable style={styles.announceSheet} onPress={() => {}}>
            <Text style={styles.announceTitle}>Hızlı Duyuru Gönder</Text>

            <Text style={styles.announceLabel}>Birimler</Text>
            <View style={styles.announceUnitsWrap}>
              {announcementUnits.map((u) => {
                const active = selectedAnnouncementUnitIds.includes(u.id)
                return (
                  <TouchableOpacity
                    key={u.id}
                    style={[styles.announceUnitChip, active && styles.announceUnitChipActive]}
                    onPress={() => toggleAnnouncementUnit(u.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.announceUnitText, active && styles.announceUnitTextActive]}>{u.name}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={styles.announceLabel}>Mesaj</Text>
            <TextInput
              style={styles.announceInput}
              placeholder="Duyuru metnini yazın..."
              placeholderTextColor={Colors.mutedText}
              multiline
              value={announcementText}
              onChangeText={setAnnouncementText}
            />

            <TouchableOpacity
              style={[styles.announceSendBtn, announcementLoading && styles.announceSendBtnDisabled]}
              onPress={sendAnnouncement}
              disabled={announcementLoading}
              activeOpacity={0.8}
            >
              <Text style={styles.announceSendBtnText}>{announcementLoading ? 'Gönderiliyor...' : 'Duyuruyu Gönder'}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={flashlightVisible} transparent={false} animationType="fade" onRequestClose={() => setFlashlightVisible(false)}>
        <View style={styles.cameraModal}>
          <CameraView style={StyleSheet.absoluteFill} enableTorch />
          <TouchableOpacity style={styles.cameraCloseBtn} onPress={() => setFlashlightVisible(false)} activeOpacity={0.7}>
            <Text style={styles.cameraCloseText}>Feneri Kapat</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={qrModalVisible} transparent animationType="slide" onRequestClose={() => setQrModalVisible(false)}>
        <View style={styles.qrModal}>
          <View style={styles.qrModalContent}>
            <CameraView
              style={styles.qrCamera}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={qrModalVisible ? handleBarcodeScanned : undefined}
            />
            <TouchableOpacity style={styles.qrCloseBtn} onPress={() => setQrModalVisible(false)} activeOpacity={0.7}>
              <Text style={styles.qrCloseText}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  )
}

const cardShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.01,
  shadowRadius: 2,
  elevation: 0,
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },
  alertBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    borderRadius: 24,
    backgroundColor: Colors.alpha.rose10,
    borderWidth: 1,
    borderColor: Colors.alpha.rose25,
  },
  alertBarManager: {
    backgroundColor: Colors.alpha.rose25,
    borderColor: Colors.error,
  },
  alertIcon: { fontSize: 14 },
  alertText: { flex: 1, color: Colors.error, fontWeight: '700' },
  managerSectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  managerSectionCaption: {
    color: Colors.mutedText,
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
  },
  managerNotificationsSection: {
    marginTop: 14,
    marginBottom: 4,
  },
  managerNotificationCard: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  managerNotificationCardWarning: {
    borderColor: '#F6D08C',
    backgroundColor: '#FFF9EE',
  },
  managerNotificationCardDanger: {
    borderColor: '#F3B7B7',
    backgroundColor: '#FFF4F4',
  },
  managerNotificationCardInfo: {
    borderColor: '#BFD8FF',
    backgroundColor: '#F6FAFF',
  },
  managerNotificationCardSuccess: {
    borderColor: '#BCE7CC',
    backgroundColor: '#F3FFF7',
  },
  managerNotificationIcon: {
    fontSize: 18,
  },
  managerNotificationTextWrap: {
    flex: 1,
  },
  managerNotificationTitle: {
    color: Colors.text,
    fontWeight: '800',
    fontSize: Typography.body.fontSize,
  },
  managerNotificationDetail: {
    marginTop: 2,
    color: Colors.mutedText,
    fontSize: Typography.caption.fontSize,
  },
  managerNotificationChevron: {
    color: Colors.mutedText,
    fontSize: 24,
    lineHeight: 24,
    marginLeft: 4,
  },
  managerDailyMetricsRow: {
    marginBottom: 12,
    flexDirection: 'row',
    gap: 8,
  },
  managerDailyMetricCard: {
    flex: 1,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.surface,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  managerDailyMetricLabel: {
    color: Colors.mutedText,
    fontSize: 11,
    fontWeight: '600',
  },
  managerDailyMetricValue: {
    marginTop: 2,
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  urgentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    borderRadius: 24,
    backgroundColor: Colors.alpha.rose10,
    borderWidth: 1,
    borderColor: Colors.alpha.rose25,
  },
  urgentBarManager: {
    backgroundColor: Colors.alpha.rose25,
    borderColor: Colors.error,
  },
  urgentIcon: { fontSize: 16 },
  urgentText: { flex: 1, color: Colors.error, fontWeight: '900' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerLeft: { flex: 1 },
  greeting: { fontSize: Typography.heading.fontSize, fontWeight: '700', color: CORPORATE_NAVY, marginBottom: 4 },
  dateText: { fontSize: Typography.body.fontSize, color: MUTED },
  weather: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weatherIconText: { fontSize: 20 },
  weatherTemp: {
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
    color: CORPORATE_NAVY,
    marginLeft: 4,
    marginTop: -4,
  },
  // Hero (Indigo gradient-like)
  hero: {
    position: 'relative',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 20,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  heroGradientA: {
    position: 'absolute',
    top: -60,
    left: -40,
    width: 220,
    height: 220,
    backgroundColor: Colors.alpha.white10,
    borderRadius: 110,
  },
  heroGradientB: {
    position: 'absolute',
    bottom: -80,
    right: -60,
    width: 260,
    height: 260,
    backgroundColor: Colors.alpha.white10,
    borderRadius: 130,
  },
  heroTextWrap: { flex: 1 },
  heroInner: { position: 'relative' },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroGreeting: { fontSize: 20, fontWeight: '700', letterSpacing: 0, color: Colors.surface, marginBottom: 4 },
  heroSub: { opacity: 0.9, fontSize: 12, color: Colors.surface, fontWeight: '400' },
  heroInlineNotice: {
    marginTop: -2,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroInlineNoticeIcon: { fontSize: 15 },
  heroInlineNoticeText: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.caption.fontSize,
    fontWeight: '700',
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.alpha.white75,
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusWidget: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.alpha.gray22,
    marginBottom: 10,
    overflow: 'hidden',
    ...cardShadow,
  },
  focusWidgetDone: {
    backgroundColor: Colors.alpha.emerald10,
  },
  focusAccent: {
    width: 6,
    backgroundColor: Colors.accent,
  },
  focusAccentDone: {
    backgroundColor: Colors.success,
  },
  focusContent: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  focusTitle: {
    color: Colors.primary,
    fontSize: Typography.caption.fontSize,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  focusTask: {
    color: Colors.text,
    fontSize: Typography.bodyLg.fontSize,
    fontWeight: '700',
    marginBottom: 4,
  },
  focusDate: {
    color: MUTED,
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
  },
  statsBlock: { marginBottom: 12 },
  dateFilterWrap: { display: 'none' },
  dateChipsRow: { display: 'none' },
  dateChip: { display: 'none' },
  dateChipActive: { display: 'none' },
  dateChipText: { display: 'none' },
  dateChipTextActive: { display: 'none' },
  dateFilterDropdown: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  dateFilterHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateFilterDropdownLabel: {
    fontSize: 10,
    color: MUTED,
    marginBottom: 3,
    letterSpacing: 0.2,
  },
  dateFilterChevron: {
    color: MUTED,
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 3,
  },
  dateFilterDropdownValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.primary,
  },
  dateFilterSheet: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    ...cardShadow,
  },
  dateFilterOption: {
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  dateFilterOptionActive: {
    backgroundColor: Colors.alpha.gray08,
  },
  dateFilterOptionText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '400',
  },
  dateFilterOptionTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  dateFilterBtn: {
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  dateFilterBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dateFilterText: {
    fontSize: 12,
    fontWeight: '500',
    color: MUTED,
  },
  dateFilterTextActive: {
    color: Colors.surface,
    fontWeight: '600',
  },

  // KPI Grid
  kpiGrid: { flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'space-between', gap: 8, marginBottom: 16 },
  personProgressStrip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1.5,
    borderColor: Colors.alpha.gray35,
    ...cardShadow,
  },
  personAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.alpha.navy05,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  personAvatarEmoji: { fontSize: 28 },
  personMeta: { flex: 1 },
  personNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  personName: { flex: 1, color: Colors.primary, fontSize: 14, fontWeight: '800' },
  personRankText: { color: MUTED, fontSize: 12, fontWeight: '600' },
  personBadgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  badgePill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeSuccess: { backgroundColor: Colors.alpha.emerald10, borderColor: Colors.alpha.emerald25 },
  badgeSuccessText: { color: Colors.success, fontWeight: '800', fontSize: 11 },
  badgeFirst: { backgroundColor: Colors.alpha.indigo12, borderColor: Colors.alpha.indigo20 },
  badgeFirstText: { color: Colors.primary, fontWeight: '800', fontSize: 11 },
  badgeText: { lineHeight: 13 },
  chainTypePill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    marginBottom: 2,
    backgroundColor: Colors.alpha.indigo12,
    borderWidth: 1,
    borderColor: Colors.alpha.indigo20,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chainTypePillText: { color: Colors.primary, fontSize: 11, fontWeight: '800' },
  personBarTrack: { height: 10, backgroundColor: Colors.alpha.gray20, borderRadius: 999, overflow: 'hidden', marginTop: 12 },
  personBarFill: { height: '100%', backgroundColor: Colors.accent, borderRadius: 999 },
  personBarFillDone: { backgroundColor: Colors.success },
  personGoalText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 15,
    marginTop: 8,
  },
  dailyPerformanceBlock: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1.5,
    borderColor: Colors.alpha.gray35,
    ...cardShadow,
    shadowOpacity: 0.04,
    elevation: 2,
    marginBottom: 12,
  },
  performanceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  performanceIdentityRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  performanceHello: { flex: 1, color: Colors.primary, fontSize: 16, fontWeight: '700' },
  rankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.alpha.indigo12,
    borderWidth: 1,
    borderColor: Colors.alpha.indigo20,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  rankPillText: { color: Colors.primary, fontWeight: '700', fontSize: 11 },
  rankCrown: { marginLeft: 6, fontSize: 12 },
  performanceHeroRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    marginBottom: 10,
  },
  performanceMetricCol: { flex: 1 },
  performanceMetricValue: { color: Colors.primary, fontSize: 28, fontWeight: '700', lineHeight: 32 },
  performanceMetricTarget: { color: MUTED, fontSize: 12, fontWeight: '500', marginTop: 2 },
  heroProgressTrack: {
    width: '100%',
    height: 10,
    borderRadius: 999,
    backgroundColor: Colors.alpha.gray20,
    overflow: 'hidden',
    marginTop: 10,
  },
  heroProgressFill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 999,
  },
  heroProgressPercent: {
    marginTop: 6,
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  goalDonePill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: Colors.alpha.emerald10,
    borderWidth: 1,
    borderColor: Colors.alpha.emerald25,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  goalDonePillText: { color: Colors.success, fontSize: 11, fontWeight: '700' },
  streakPill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.alpha.indigo06,
    borderWidth: 1,
    borderColor: Colors.alpha.indigo20,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  streakIcon: { fontSize: 12, marginRight: 5 },
  streakText: { color: Colors.primary, fontSize: 11, fontWeight: '700' },
  ringCenterTextWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: RING_SIZE,
    height: RING_SIZE,
  },
  ringCenterTop: { color: Colors.primary, fontWeight: '800', fontSize: 10, marginBottom: 1 },
  ringCenterValue: { color: Colors.accent, fontWeight: '900', fontSize: 14 },
  kpiCard: {
    width: '31.5%',
    aspectRatio: 1.08,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    justifyContent: 'space-between',
    overflow: 'hidden',
    ...cardShadow,
  },
  kpiPendingCard: {
    borderTopColor: Colors.accent,
    borderColor: Colors.alpha.gray22,
    shadowColor: Colors.accent,
    shadowOpacity: 0.08,
  },
  kpiLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    lineHeight: 12,
  },
  kpiPendingLabel: {
    color: Colors.accent,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    lineHeight: 12,
  },
  kpiValue: {
    color: '#0A1E42',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
    lineHeight: 19,
  },
  kpiPendingValue: {
    color: Colors.accent,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
    lineHeight: 19,
  },
  kpiSub: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '400',
    marginTop: 2,
    lineHeight: 11,
  },
  staffSnapshotText: { display: 'none' },
  progressRingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: Colors.alpha.gray35,
    padding: 16,
    marginBottom: 8,
  },
  performanceDivider: {
    height: 1,
    backgroundColor: Colors.alpha.gray20,
    marginVertical: 12,
  },
  performanceSummaryRow: { flexDirection: 'row', gap: 8 },
  summaryMiniCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.alpha.gray35,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  summaryMiniIcon: { fontSize: 13, marginBottom: 3 },
  summaryMiniValue: { fontSize: 18, fontWeight: '700', color: Colors.primary, lineHeight: 22 },
  summaryMiniLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: MUTED,
    letterSpacing: 0.4,
  },
  sparklineWrap: {
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRingTitle: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  progressRingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenterText: {
    position: 'absolute',
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  progressRingMeta: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  liveAuditSection: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.alpha.gray22,
    marginBottom: 12,
    ...cardShadow,
  },
  auditScroll: { marginTop: 8 },
  auditFeedCard: {
    width: 236,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.alpha.gray22,
    marginRight: 12,
    ...cardShadow,
  },
  auditThumb: { width: '100%', height: 164, backgroundColor: Colors.card },
  auditThumbFallback: { width: '100%', height: 164, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center' },
  auditThumbFallbackText: { color: MUTED, fontWeight: '700', fontSize: 12 },
  auditTextWrap: { padding: 14, backgroundColor: Colors.inputBg },
  auditTitle: { fontWeight: '700', color: Colors.text, fontSize: 13, marginBottom: 3 },
  auditPerson: { color: Colors.primary, fontSize: 11, fontWeight: '600', marginBottom: 6 },
  auditBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  auditStatusChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 4,
    borderWidth: 1,
  },
  auditStatusChipSuccess: { backgroundColor: Colors.alpha.emerald10, borderColor: Colors.alpha.emerald25 },
  auditStatusChipAccent: { backgroundColor: Colors.alpha.indigo12, borderColor: Colors.alpha.indigo20 },
  auditStatusChipPending: { backgroundColor: Colors.alpha.gray10, borderColor: Colors.alpha.gray20 },
  auditStatusChipText: { color: Colors.primary, fontSize: 11, fontWeight: '700' },
  auditRepeatedNote: { color: Colors.mutedText, fontSize: 11, fontWeight: '600', marginBottom: 2 },
  auditDate: { color: Colors.mutedText, fontWeight: '700', fontSize: 10 },
  leaderboardWidget: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.alpha.gray22,
    padding: 16,
    marginBottom: 8,
    ...cardShadow,
  },
  leaderboardRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.alpha.gray22,
    borderRadius: 16,
    padding: 10,
    marginBottom: 8,
  },
  leaderboardAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.alpha.indigo10,
    borderWidth: 1,
    borderColor: Colors.alpha.indigo20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  leaderboardAvatarText: {
    color: Colors.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  leaderboardMainCol: { flex: 1 },
  leaderboardTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  leaderboardName: {
    color: Colors.text,
    fontSize: Typography.body.fontSize,
    fontWeight: '700',
  },
  leaderboardMeta: {
    color: MUTED,
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
    marginBottom: 6,
  },
  leaderboardPoints: {
    color: Colors.primary,
    fontSize: Typography.caption.fontSize,
    fontWeight: '800',
  },
  leaderboardProgressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: Colors.alpha.gray20,
    overflow: 'hidden',
  },
  leaderboardProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.accent,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: CORPORATE_NAVY, marginBottom: 8, letterSpacing: 0.2 },
  sentSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    color: CORPORATE_NAVY,
  },
  sentSectionTitleWrap: {
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 10,
    ...cardShadow,
  },
  monthlyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.alpha.gray22,
    ...cardShadow,
  },
  monthlyBigValue: {
    fontSize: Typography.heading.fontSize,
    fontWeight: '900',
    color: CORPORATE_NAVY,
    textAlign: 'center',
    marginBottom: 8,
  },
  progressTrack: { height: 12, backgroundColor: Colors.alpha.gray20, borderRadius: 8, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 8 },
  monthlyNote: { fontSize: Typography.body.fontSize, color: MUTED, fontWeight: '500' },
  dailyStatsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  dailyCard: { flex: 1, borderRadius: 24, padding: 16, borderWidth: 1.5, borderColor: Colors.alpha.gray35 },
  dailyCardTotal: { backgroundColor: Colors.surface },
  dailyCardCompleted: { backgroundColor: Colors.surface },
  dailyCardPending: { backgroundColor: Colors.surface },
  dailyCardValue: { fontSize: 18, fontWeight: '700', color: CORPORATE_NAVY, marginBottom: 4 },
  dailyCardLabel: { fontSize: 11, color: MUTED, fontWeight: '500' },
  toolsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  toolWrap: { alignItems: 'center' },
  toolBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.alpha.navy05,
    justifyContent: 'center',
    alignItems: 'center',
    ...cardShadow,
  },
  toolEmoji: { fontSize: 16 },
  toolLabel: { fontSize: 11, color: MUTED, marginTop: 4 },
  recentCard: {
    backgroundColor: Colors.inputBg,
    borderRadius: 24,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.alpha.gray25,
    ...cardShadow,
  },
  recentCardApproved: { backgroundColor: Colors.alpha.emerald10, borderColor: Colors.alpha.emerald25 },
  recentCardPending: { backgroundColor: Colors.alpha.amber10, borderColor: Colors.alpha.amber25 },
  recentCardRejected: { backgroundColor: Colors.alpha.rose10, borderColor: Colors.alpha.rose25 },
  recentTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  recentTitle: { fontSize: 14, fontWeight: '700', color: CORPORATE_NAVY, marginBottom: 2 },
  chainTypeChip: {
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: Colors.alpha.indigo12,
    borderWidth: 1,
    borderColor: Colors.alpha.indigo20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  chainTypeChipText: { color: Colors.primary, fontSize: 12, fontWeight: '900' },
  recentMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  recentMetaLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  recentMetaPill: {
    backgroundColor: Colors.alpha.gray12,
    borderWidth: 1,
    borderColor: Colors.alpha.gray25,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  recentMetaPillApproved: {
    backgroundColor: Colors.alpha.emerald10,
    borderColor: Colors.alpha.emerald25,
  },
  recentMetaPillPending: {
    backgroundColor: Colors.alpha.amber10,
    borderColor: Colors.alpha.amber25,
  },
  recentMetaPillRejected: {
    backgroundColor: Colors.alpha.rose10,
    borderColor: Colors.alpha.rose25,
  },
  recentMetaPillText: {
    color: Colors.text,
    fontSize: Typography.caption.fontSize,
    fontWeight: '700',
  },
  recentDate: { fontSize: Typography.caption.fontSize, color: MUTED },
  recentStatusEmoji: { fontSize: 24, marginLeft: 10 },
  managerNotePreview: {
    marginTop: 6,
    color: Colors.mutedText,
    fontSize: Typography.caption.fontSize,
    fontStyle: 'italic',
  },
  emptyRecent: { fontSize: 13, color: MUTED, marginBottom: 12 },
  managerCompletionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    marginBottom: 8,
    ...cardShadow,
  },
  managerCompletionTitle: { fontSize: 15, fontWeight: '800', color: Colors.primary, marginBottom: 10 },
  managerCompletionTrack: {
    height: 12,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: Colors.alpha.gray20,
  },
  managerCompletionFill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 999,
  },
  managerCompletionMeta: {
    marginTop: 8,
    color: Colors.mutedText,
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
  },
  managerGraphWrap: {
    marginTop: 2,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.alpha.navy05,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    paddingVertical: 8,
  },
  managerGraphAxisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    paddingHorizontal: 6,
  },
  managerGraphAxisText: {
    color: Colors.mutedText,
    fontSize: 10,
    fontWeight: '600',
  },
  managerLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    rowGap: 6,
    columnGap: 10,
  },
  managerLegendItem: {
    color: Colors.text,
    fontSize: Typography.caption.fontSize,
    fontWeight: '700',
  },
  managerDetailBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  managerDetailBtnText: {
    color: Colors.surface,
    fontSize: Typography.caption.fontSize,
    fontWeight: '700',
  },
  managerModalBackdrop: {
    flex: 1,
    backgroundColor: Colors.alpha.black40,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  managerModalSheet: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    padding: 16,
  },
  managerModalTitle: {
    color: Colors.primary,
    fontSize: Typography.subheading.fontSize,
    fontWeight: '800',
    marginBottom: 10,
  },
  managerModalRow: { color: Colors.text, fontSize: Typography.body.fontSize, marginBottom: 8 },
  managerModalCloseBtn: {
    marginTop: 6,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 10,
  },
  managerModalCloseText: { color: Colors.surface, fontWeight: '700', fontSize: Typography.body.fontSize },
  announceBackdrop: {
    flex: 1,
    backgroundColor: Colors.alpha.black40,
    justifyContent: 'flex-end',
  },
  announceSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
  },
  announceTitle: { color: Colors.primary, fontSize: 16, fontWeight: '800', marginBottom: 12 },
  announceLabel: { color: Colors.mutedText, fontSize: 12, fontWeight: '600', marginBottom: 8, marginTop: 8 },
  announceUnitsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  announceUnitChip: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.surface,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  announceUnitChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.alpha.indigo12,
  },
  announceUnitText: { color: Colors.text, fontSize: 12, fontWeight: '500' },
  announceUnitTextActive: { color: Colors.primary, fontWeight: '700' },
  announceInput: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  announceSendBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  announceSendBtnDisabled: {
    opacity: 0.7,
  },
  announceSendBtnText: { color: Colors.surface, fontSize: 14, fontWeight: '700' },
  cameraModal: { flex: 1, backgroundColor: Colors.primary },
  cameraCloseBtn: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: Colors.alpha.white10,
    borderWidth: 1,
    borderColor: Colors.alpha.gray22,
    borderRadius: 12,
  },
  cameraCloseText: { fontSize: Typography.body.fontSize, fontWeight: '700', color: Colors.surface },
  qrModal: { flex: 1, backgroundColor: Colors.alpha.black60, justifyContent: 'flex-end' },
  qrModalContent: { height: 400, backgroundColor: Colors.primary, overflow: 'hidden', borderTopLeftRadius: Layout.borderRadius.lg, borderTopRightRadius: Layout.borderRadius.lg },
  qrCamera: { flex: 1, width: '100%' },
  qrCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.alpha.slate9009,
    borderRadius: 12,
  },
  qrCloseText: { fontSize: Typography.body.fontSize, fontWeight: '600', color: Colors.surface },

  // Top-level dashboard ranking
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  rankName: { flex: 1, color: CORPORATE_NAVY, fontWeight: '800', fontSize: Typography.caption.fontSize },
  rankTrack: {
    width: 90,
    height: 10,
    borderRadius: 999,
    backgroundColor: Colors.alpha.gray20,
    overflow: 'hidden',
  },
  rankFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 999,
  },
  rankRate: { width: 48, textAlign: 'right', color: CORPORATE_NAVY, fontWeight: '900', fontSize: Typography.caption.fontSize },

  // Live feed (completed tasks evidence)
  feedRow: { marginBottom: 12 },
  feedCard: {
    width: 170,
    marginRight: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  feedThumb: { width: 50, height: 50, borderRadius: 10, backgroundColor: Colors.card },
  feedThumbFallback: { width: 50, height: 50, borderRadius: 10, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center' },
  feedTextWrap: { flex: 1, justifyContent: 'center' },
  feedThumbFallbackText: { color: Colors.gray, fontWeight: '700', fontSize: 11 },
  feedTitle: { fontWeight: '600', color: Colors.text, fontSize: 13, marginBottom: 2 },
  feedDate: { color: Colors.mutedText, fontWeight: '500', fontSize: 11 },

})
