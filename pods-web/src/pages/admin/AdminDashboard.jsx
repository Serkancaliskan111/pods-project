import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  BarChart3,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  CalendarCheck,
  RotateCcw,
  Play,
  Target,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'
import getSupabase from '../../lib/supabaseClient'
import { AuthContext } from '../../contexts/AuthContext.jsx'
import { hasManagementDashboardAccess } from '../../lib/permissions.js'
import {
  DASHBOARD_ISLER_LIMIT,
  enrichScopeWithJunctionPersonelIds,
  scopeAnaSirketlerQuery,
  scopeBirimlerQuery,
  scopeIslerQuery,
  scopePersonelQuery,
} from '../../lib/supabaseScope.js'
import { formatTimestampForFilter } from '../../lib/postgrestFilters.js'
import CubicleHome from './CubicleHome.jsx'
import {
  TASK_STATUS,
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
  normalizeTaskStatus,
} from '../../lib/taskStatus.js'
import { isTaskVisibleNow, isTaskVisibleToPerson } from '../../lib/taskVisibility.js'
import { groupTasksByGrupId } from '../../lib/groupTasks.js'
import {
  formatTaskTitleCase,
} from '../../lib/formatTaskTitle.js'
import { cubicle } from '../../theme/cubicle.js'

const supabase = getSupabase()

function formatDateInputLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDateInputLocal(value) {
  const raw = String(value || '').trim()
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const [yy, mm, dd] = raw.split('-').map((x) => Number(x))
  const dt = new Date(yy, mm - 1, dd, 0, 0, 0, 0)
  if (Number.isNaN(dt.getTime())) return null
  return dt
}

/** @returns {{ start: Date, end: Date } | null} null = tüm zamanlar */
function resolveDateRange(dateFilter, customRangeStart, customRangeEnd) {
  const now = new Date()
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  )
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  )

  if (dateFilter === 'today') {
    return { start: startOfToday, end: endOfToday }
  }
  if (dateFilter === '7d') {
    const start = new Date(startOfToday)
    start.setDate(start.getDate() - 6)
    return { start, end: endOfToday }
  }
  if (dateFilter === '30d') {
    const start = new Date(startOfToday)
    start.setDate(start.getDate() - 29)
    return { start, end: endOfToday }
  }
  if (dateFilter === '90d') {
    const start = new Date(startOfToday)
    start.setDate(start.getDate() - 89)
    return { start, end: endOfToday }
  }
  if (dateFilter === 'custom') {
    let start = parseDateInputLocal(customRangeStart)
    let end = parseDateInputLocal(customRangeEnd)
    if (!start || !end) {
      const fallbackStart = new Date(startOfToday)
      fallbackStart.setDate(fallbackStart.getDate() - 6)
      start = start || fallbackStart
      end = end || endOfToday
    }
    if (start.getTime() > end.getTime()) {
      const tmp = start
      start = end
      end = tmp
    }
    const endInclusive = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999)
    const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0)
    return { start: startMidnight, end: endInclusive }
  }
  return null
}

function isDateInRange(rawDate, range) {
  if (!range) return true
  if (!rawDate) return false
  const d = new Date(rawDate)
  if (Number.isNaN(d.getTime())) return false
  return d >= range.start && d <= range.end
}

function ensureCustomRangeDefaults(setStart, setEnd) {
  setStart((prev) => {
    if (prev) return prev
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    start.setDate(start.getDate() - 6)
    return formatDateInputLocal(start)
  })
  setEnd((prev) => {
    if (prev) return prev
    return formatDateInputLocal(new Date())
  })
}

function formatRelativeTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  if (diffMs < 0) return 'az önce'
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  if (diffMin < 1) return 'az önce'
  if (diffMin < 60) return `${diffMin} dk önce`
  if (diffHour < 24) return `${diffHour} saat önce`
  if (diffDay < 7) return `${diffDay} gün önce`
  return date.toLocaleDateString('tr-TR')
}

function normalizePhotoList(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.flatMap((v) => normalizePhotoList(v)).filter(Boolean)
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        return normalizePhotoList(JSON.parse(trimmed))
      } catch (_) {
        // ignore JSON parse error and continue with plain string handling
      }
    }
    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
    return [trimmed]
  }
  if (typeof raw === 'object') {
    const candidates = [
      raw.url,
      raw.path,
      raw.src,
      raw.photo_url,
      raw.foto_url,
      raw.image_url,
      raw.images,
      raw.fotos,
      raw.foto_urls,
      raw.kanit_resim_ler,
      raw.kanit_fotograflari,
      raw.resimler,
    ]
    const nested = candidates.flatMap((v) => normalizePhotoList(v)).filter(Boolean)
    if (nested.length) return nested
    // kanit_foto_durumlari gibi { "<url>": "onaylandi" } map formatları
    const keyUrls = Object.keys(raw || {}).filter((k) => {
      const key = String(k || '').trim()
      if (!key) return false
      return key.startsWith('http://') || key.startsWith('https://') || key.startsWith('data:image/')
    })
    if (keyUrls.length) return keyUrls
    return []
  }
  return []
}

/**
 * kanit_videolar / checklist videoları: dizi, JSON string, tek { url } nesnesi veya düz URL string.
 */
function normalizeKanitVideoUrlList(raw) {
  if (raw == null) return []

  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t) return []
    try {
      const p = JSON.parse(t)
      return normalizeKanitVideoUrlList(p)
    } catch {
      if (/^https?:\/\//i.test(t)) return [t]
      return []
    }
  }

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const u = raw.url ?? raw.publicUrl ?? raw.public_url
    if (u != null && u !== '') {
      const s = String(u).trim()
      return s ? [s] : []
    }
    return []
  }

  if (!Array.isArray(raw)) return []

  const out = []
  for (const v of raw) {
    if (typeof v === 'string') {
      const u = v.trim()
      if (u) out.push(u)
    } else if (v && typeof v === 'object') {
      const cand = v.url ?? v.publicUrl ?? v.public_url
      if (cand != null && cand !== '') {
        const u = String(cand).trim()
        if (u) out.push(u)
      }
    }
  }
  return out
}

/** Görev satırından tüm video URL'leri (kök + checklist maddeleri). */
function collectJobVideoEvidenceUrls(job) {
  const seen = new Set()
  const addMany = (urls) => {
    for (const u of urls) {
      const s = String(u || '').trim()
      if (s) seen.add(s)
    }
  }

  addMany(normalizeKanitVideoUrlList(job?.kanit_videolar))

  if (Array.isArray(job?.checklist_cevaplari)) {
    for (const ans of job.checklist_cevaplari) {
      const candidates = [
        ans?.videolar,
        ans?.videos,
        ans?.video_urls,
        ans?.kanit_videolar,
      ]
      for (const c of candidates) {
        addMany(normalizeKanitVideoUrlList(c))
      }
    }
  }

  return Array.from(seen)
}

function isZincirGorevType(value) {
  const t = String(value || '').toLowerCase()
  return t.includes('zincir_gorev')
}

function isOverdueTask(task, now = new Date()) {
  const durum = normalizeTaskStatus(task?.durum)
  if (!task?.son_tarih) return false
  if (isApprovedTaskStatus(durum)) return false
  const due = new Date(task.son_tarih)
  if (Number.isNaN(due.getTime()) || due >= now) return false
  if (isPendingApprovalTaskStatus(durum)) {
    const completedAt = new Date(task.updated_at || task.created_at || 0)
    if (!Number.isNaN(completedAt.getTime()) && completedAt <= due) {
      return false
    }
  }
  return true
}

const LIVE_FLOW_LIMIT = 30
const LIVE_FLOW_PAGE_SIZE = 5
/** Son gönderilen işler — panel içinde kaydırılır */
const ACTIVITY_FEED_LIMIT = 20

const KPI_DATE_FILTERS = [
  { key: 'today', label: 'Bugün' },
  { key: '7d', label: 'Son 7 Gün' },
  { key: '30d', label: 'Son 30 Gün' },
  { key: '90d', label: 'Son 90 Gün' },
  { key: 'custom', label: 'Özel Tarih Aralığı' },
  { key: 'all', label: 'Tam Zamanlar' },
]

function formatStaffDisplayName(person) {
  if (!person) return ''
  if (person.ad || person.soyad) {
    return `${person.ad || ''} ${person.soyad || ''}`.trim()
  }
  return person.email || ''
}

function formatDurationTr(ms) {
  if (!ms || ms <= 0) return '—'
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)
  if (days >= 1) return `${days} gün`
  if (hours >= 1) return `${hours} saat`
  const mins = Math.max(1, Math.round(ms / (1000 * 60)))
  return `${mins} dk`
}

function normalizeTimelineArray(raw) {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function getTimelineEventMs(event) {
  if (!event?.at) return null
  const ts = new Date(event.at).getTime()
  return Number.isNaN(ts) ? null : ts
}

function isApprovalReviewEvent(event) {
  const note = String(event?.note || '').toLowerCase()
  return note === 'approve' || note.includes('onayla')
}

/** Tamamlanma → onay arası süre (ms); zaman çizelgesi yoksa null */
function getCompletionToApprovalDelayMs(job) {
  if (!isApprovedTaskStatus(job?.durum)) return null

  const completionTimes = normalizeTimelineArray(job?.tamamlama_gecmisi)
    .map(getTimelineEventMs)
    .filter((t) => t != null)
    .sort((a, b) => a - b)

  const approvalTimes = normalizeTimelineArray(job?.denetim_gecmisi)
    .filter(isApprovalReviewEvent)
    .map(getTimelineEventMs)
    .filter((t) => t != null)
    .sort((a, b) => a - b)

  if (!completionTimes.length || !approvalTimes.length) return null

  const lastApproval = approvalTimes[approvalTimes.length - 1]
  const completionBeforeApproval = completionTimes
    .filter((t) => t <= lastApproval)
    .pop()

  if (completionBeforeApproval == null) return null
  const delta = lastApproval - completionBeforeApproval
  return delta > 0 ? delta : null
}

function getLastApprovalMs(job) {
  if (!isApprovedTaskStatus(job?.durum)) return null
  const approvalTimes = normalizeTimelineArray(job?.denetim_gecmisi)
    .filter(isApprovalReviewEvent)
    .map(getTimelineEventMs)
    .filter((t) => t != null)
  if (approvalTimes.length) return Math.max(...approvalTimes)
  const updated = new Date(job.updated_at || job.created_at || 0).getTime()
  return Number.isNaN(updated) ? null : updated
}

/** Onaylanmış görev son tarihe kadar mı tamamlandı? son_tarih yoksa null */
function isOnTimeApproved(job) {
  if (!isApprovedTaskStatus(job?.durum) || !job?.son_tarih) return null
  const due = new Date(job.son_tarih)
  if (Number.isNaN(due.getTime())) return null
  const dueEnd = new Date(
    due.getFullYear(),
    due.getMonth(),
    due.getDate(),
    23,
    59,
    59,
    999,
  )
  const approvalMs = getLastApprovalMs(job)
  if (approvalMs == null) return null
  return approvalMs <= dueEnd.getTime()
}

function isRejectReviewEvent(event) {
  const note = String(event?.note || '').toLowerCase()
  return note.includes('reject') || note.includes('red')
}

function hadResubmission(job) {
  const status = normalizeTaskStatus(job?.durum)
  if (status === TASK_STATUS.RESUBMITTED) return true
  if (normalizeTimelineArray(job?.tamamlama_gecmisi).length > 1) return true
  if (normalizeTimelineArray(job?.denetim_gecmisi).some(isRejectReviewEvent)) {
    return true
  }
  return false
}

function enteredReviewPipeline(job) {
  const status = normalizeTaskStatus(job?.durum)
  if (isPendingApprovalTaskStatus(status)) return true
  if (isApprovedTaskStatus(status)) return true
  if (status === TASK_STATUS.RESUBMITTED) return true
  if (status === TASK_STATUS.REJECTED) return true
  if (normalizeTimelineArray(job?.tamamlama_gecmisi).length > 0) return true
  return false
}

function getActivityStatusStyle(status) {
  const key = String(status || '').toLowerCase()
  if (key.includes('onaylandı') || key.includes('tamam')) {
    return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' }
  }
  if (key.includes('onay bekliyor') || key.includes('tekrar')) {
    return { bg: '#fffbeb', color: '#b45309', border: '#fde68a' }
  }
  if (key.includes('redded')) {
    return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' }
  }
  return { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' }
}

function resolveAssigneeDisplay(j, staffById, jobsByGrupId) {
  if (j?.grup_id && jobsByGrupId) {
    const rows = jobsByGrupId.get(String(j.grup_id)) || []
    const names = [
      ...new Set(
        rows
          .map((r) => formatStaffDisplayName(staffById[r?.sorumlu_personel_id]))
          .filter(Boolean),
      ),
    ]
    if (names.length > 2) {
      return `${names.slice(0, 2).join(', ')} +${names.length - 2} kişi`
    }
    if (names.length) return names.join(', ')
    if (rows.length > 1) return `${rows.length} kişilik ekip görevi`
  }

  const direct = formatStaffDisplayName(staffById[j?.sorumlu_personel_id])
  if (direct) return direct

  const stepPersonId = j?._liveFlowStepPersonelId
  if (stepPersonId) {
    const stepName = formatStaffDisplayName(staffById[stepPersonId])
    if (stepName) return stepName
  }

  const tur = String(j?.gorev_turu || '').toLowerCase()
  if (tur.includes('sirali') || tur.includes('zincir')) return 'Operasyon ekibi'
  return 'Görev ekibi'
}

function buildLiveFlowItem(j, { companyById, unitById, staffById, jobsByGrupId }) {
  const company = companyById[j.ana_sirket_id]
  const unit = j.birim_id ? unitById[j.birim_id] : null
  let companyName = ''
  if (company?.ana_sirket_adi) {
    companyName = company.ana_sirket_adi
  } else {
    const personRow = j.sorumlu_personel_id ? staffById[j.sorumlu_personel_id] : null
    const guessedCompanyId =
      j.ana_sirket_id || unit?.ana_sirket_id || personRow?.ana_sirket_id
    const guessedCompany =
      (guessedCompanyId && companyById[guessedCompanyId]) || null
    companyName =
      guessedCompany?.ana_sirket_adi || j.ana_sirket_adi || j.sirket_adi || ''
  }

  const unitName = unit?.birim_adi || ''
  const personName = resolveAssigneeDisplay(j, staffById, jobsByGrupId)
  const titleFull = formatTaskTitleCase(j.baslik || 'Görev')

  const dateObj = new Date(j.updated_at || j.created_at || 0)
  const rel = formatRelativeTime(dateObj)
  let abs = ''
  if (!Number.isNaN(dateObj.getTime())) {
    const monthsTr = [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
    ]
    const day = dateObj.getDate()
    const monthName = monthsTr[dateObj.getMonth()] || ''
    const timeStr = dateObj.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    })
    abs = `${day} ${monthName} - ${timeStr}`
  }

  const photoUrls = normalizePhotoList(j.kanit_resim_ler)
  const videoUrls = collectJobVideoEvidenceUrls(j)
  const media = [
    ...photoUrls.map((url) => ({ type: 'photo', url })),
    ...videoUrls.map((url) => ({ type: 'video', url })),
  ].slice(0, 3)

  return {
    id: j.id,
    title: titleFull,
    titleFull,
    company: companyName || '—',
    person: personName || 'Görev ekibi',
    timeRelative: rel,
    timeAbsolute: abs,
    unit: unitName || null,
    media,
    photos: photoUrls,
    videos: videoUrls,
    description: '',
  }
}

function AdminDashboardKokpit() {
  const navigate = useNavigate()

  const { profile, personel, scopeReady } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
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
  /** Şirket / birim yöneticisi — platform geneli KPI ve şirket seçicileri gizlenir */
  const companyScoped = !isSystemAdmin && !!currentCompanyId

  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState({
    totalTasks: 0,
    activeStaff: 0,
    pendingApprovals: 0,
    completedToday: 0,
  })
  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [staff, setStaff] = useState([])
  const [jobs, setJobs] = useState([])
  const [metricJobs, setMetricJobs] = useState([])
  const [hoveredMetric, setHoveredMetric] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [previewVideo, setPreviewVideo] = useState(null)

  const openPhotoPreview = (item, url) => {
    const urls = (item?.media || [])
      .filter((m) => m.type === 'photo' && m.url)
      .map((m) => m.url)
    if (!urls.length) return
    const index = Math.max(0, urls.indexOf(url))
    setPreviewVideo(null)
    setPhotoPreview({ urls, index })
  }

  const closePhotoPreview = () => setPhotoPreview(null)

  const stepPhotoPreview = (delta) => {
    setPhotoPreview((prev) => {
      if (!prev?.urls?.length) return prev
      const len = prev.urls.length
      const next = (prev.index + delta + len) % len
      return { ...prev, index: next }
    })
  }
  const [liveFlowPage, setLiveFlowPage] = useState(0)
  const [liveFlowSlideDir, setLiveFlowSlideDir] = useState('next')
  const [liveFlowAnimTick, setLiveFlowAnimTick] = useState(0)
  const [dateFilter, setDateFilter] = useState('today') // 'today' | '7d' | '30d' | '90d' | 'custom' | 'all'
  const [customRangeStart, setCustomRangeStart] = useState('')
  const [customRangeEnd, setCustomRangeEnd] = useState('')
  /** Rapor özeti — üst tarih filtresinden bağımsız */
  const [reportDateFilter, setReportDateFilter] = useState('30d')
  const [reportCustomRangeStart, setReportCustomRangeStart] = useState('')
  const [reportCustomRangeEnd, setReportCustomRangeEnd] = useState('')
  const [urgentAlertsOpen, setUrgentAlertsOpen] = useState(true)
  const reportSummaryPanelRef = useRef(null)
  const [reportSummaryPanelHeight, setReportSummaryPanelHeight] = useState(null)
  const hasHydratedDataRef = useRef(false)
  const dashboardCacheKey = useMemo(() => {
    if (!canLoadWithScope) return null
    const companyPart = isSystemAdmin ? 'system' : String(currentCompanyId || 'none')
    const unitPart = isSystemAdmin ? 'all' : JSON.stringify(accessibleUnitIds || [])
    return `web_admin_dashboard_cache_v1:${companyPart}:${unitPart}`
  }, [canLoadWithScope, isSystemAdmin, currentCompanyId, JSON.stringify(accessibleUnitIds || [])])

  useEffect(() => {
    if (!dashboardCacheKey || hasHydratedDataRef.current) return
    try {
      const raw = window.sessionStorage.getItem(dashboardCacheKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return
      if (Array.isArray(parsed.companies)) setCompanies(parsed.companies)
      if (Array.isArray(parsed.units)) setUnits(parsed.units)
      if (Array.isArray(parsed.staff)) setStaff(parsed.staff)
      if (Array.isArray(parsed.jobs)) setJobs(parsed.jobs)
      if (Array.isArray(parsed.metricJobs)) setMetricJobs(parsed.metricJobs)
      if (parsed.kpis && typeof parsed.kpis === 'object') setKpis(parsed.kpis)
      hasHydratedDataRef.current = true
      setLoading(false)
    } catch (_) {
      // ignore cache parse errors
    }
  }, [dashboardCacheKey])

  useEffect(() => {
    if (!canLoadWithScope) return
    const load = async () => {
      if (!hasHydratedDataRef.current) setLoading(true)
      const scope = await enrichScopeWithJunctionPersonelIds(supabase, {
        isSystemAdmin,
        currentCompanyId,
        accessibleUnitIds,
      })
      try {
        const fetchAllScopedTasks = async (selectColumns) => {
          const pageSize = 1000
          let from = 0
          const rows = []
          while (true) {
            let pageQuery = scopeIslerQuery(
              supabase
                .from('isler')
                .select(selectColumns)
                .order('updated_at', { ascending: false }),
              scope,
            )
            pageQuery = pageQuery.range(from, from + pageSize - 1)
            const { data, error } = await pageQuery
            if (error) return { data: null, error }
            const page = Array.isArray(data) ? data : []
            rows.push(...page)
            if (page.length < pageSize) break
            from += pageSize
            if (from >= 50000) break
          }
          return { data: rows, error: null }
        }

        const now = new Date()
        const todayStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          0,
          0,
          0,
          0,
        )
        const todayEnd = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          23,
          59,
          59,
          999,
        )

        // 1. aşama: hafif sorgular (4 paralel)
        const [
          { data: companiesData, error: compErr },
          { data: unitsData, error: unitsErr },
          { data: staffData, error: staffErr },
        ] = await Promise.all([
          scopeAnaSirketlerQuery(
            supabase
              .from('ana_sirketler')
              .select('id,ana_sirket_adi,vergi_no')
              .is('silindi_at', null),
            scope,
          ),
          scopeBirimlerQuery(
            supabase
              .from('birimler')
              .select('id,birim_adi,ana_sirket_id')
              .is('silindi_at', null),
            scope,
          ),
          scopePersonelQuery(
            supabase
              .from('personeller')
              .select('id,ad,soyad,email,ana_sirket_id,birim_id,durum')
              .is('silindi_at', null),
            scope,
          ),
        ])

        if (compErr || staffErr || unitsErr) {
          console.error(compErr || staffErr || unitsErr)
          setLoading(false)
          return
        }

        // 2. aşama: ağır görev listesi — üst sınır + sıralama (tüm tabloyu çekme)
        let jobsQ = scopeIslerQuery(
          supabase
            .from('isler')
            .select(
              'id,baslik,durum,aciklama,personel_tamamlama_notu,updated_at,created_at,son_tarih,ana_sirket_id,birim_id,sorumlu_personel_id,atayan_personel_id,ozel_gorev,grup_id,acil,puan,kanit_resim_ler,kanit_videolar,checklist_cevaplari,gorev_turu',
            )
            .order('updated_at', { ascending: false }),
          scope,
        )
        jobsQ = jobsQ.limit(DASHBOARD_ISLER_LIMIT)
        const { data: jobsData, error: jobsErr } = await jobsQ

        if (jobsErr) {
          console.error(jobsErr)
          setLoading(false)
          return
        }

        const baseJobs = Array.isArray(jobsData) ? jobsData : []
        const chainJobIds = baseJobs
          .filter((j) => isZincirGorevType(j?.gorev_turu))
          .map((j) => j.id)
          .filter(Boolean)

        let stepPhotosByJobId = {}
        let stepVideosByJobId = {}
        let stepPersonByJobId = {}
        if (chainJobIds.length) {
          let { data: chainSteps, error: chainStepsErr } = await supabase
            .from('isler_zincir_gorev_adimlari')
            .select('is_id,adim_no,personel_id,kanit_resim_ler,kanit_videolar,kanit_foto_durumlari')
            .in('is_id', chainJobIds)
            .order('adim_no', { ascending: false })
          if (chainStepsErr?.code === '42703') {
            const legacyStepsRes = await supabase
              .from('isler_zincir_gorev_adimlari')
              .select('is_id,adim_no,kanit_resim_ler')
              .in('is_id', chainJobIds)
              .order('adim_no', { ascending: false })
            chainSteps = legacyStepsRes.data
            chainStepsErr = legacyStepsRes.error
          }
          if (chainStepsErr) {
            console.error('chain steps load warning', chainStepsErr)
            chainSteps = []
          }

          ;(chainSteps || []).forEach((step) => {
            const jobId = step?.is_id
            if (!jobId) return
            if (step?.personel_id && !stepPersonByJobId[jobId]) {
              stepPersonByJobId[jobId] = step.personel_id
            }
            const photos = [
              ...normalizePhotoList(step?.kanit_resim_ler),
              ...normalizePhotoList(step?.kanit_foto_durumlari),
            ]
            if (!photos.length) return
            const existing = stepPhotosByJobId[jobId] || []
            stepPhotosByJobId[jobId] = Array.from(new Set([...existing, ...photos]))
          })

          ;(chainSteps || []).forEach((step) => {
            const jobId = step?.is_id
            if (!jobId) return
            const vids = normalizeKanitVideoUrlList(step?.kanit_videolar)
            if (!vids.length) return
            const existing = stepVideosByJobId[jobId] || []
            stepVideosByJobId[jobId] = Array.from(new Set([...existing, ...vids]))
          })
        }

        const jobsWithFallbackPhotos = baseJobs.map((job) => {
          let next = {
            ...job,
            ...(stepPersonByJobId[job?.id]
              ? { _liveFlowStepPersonelId: stepPersonByJobId[job.id] }
              : {}),
          }
          const directPhotos = normalizePhotoList(job?.kanit_resim_ler)
          if (!directPhotos.length) {
            const checklistPhotos = Array.isArray(job?.checklist_cevaplari)
              ? job.checklist_cevaplari
                  .flatMap((ans) =>
                    normalizePhotoList(
                      ans?.fotos ??
                        ans?.foto_urls ??
                        ans?.kanit_resim_ler ??
                        ans?.kanit_fotograflari ??
                        ans?.resimler ??
                        ans?.gorseller ??
                        ans,
                    ),
                  )
                  .filter(Boolean)
              : []

            const stepPhotos = stepPhotosByJobId[job?.id] || []

            if (checklistPhotos.length) {
              next = { ...next, kanit_resim_ler: checklistPhotos }
            } else if (stepPhotos.length) {
              next = { ...next, kanit_resim_ler: stepPhotos }
            }
          }

          const directVideos = normalizeKanitVideoUrlList(next?.kanit_videolar)
          if (!directVideos.length) {
            const checklistVideos = Array.isArray(next?.checklist_cevaplari)
              ? next.checklist_cevaplari.flatMap((ans) => [
                  ...normalizeKanitVideoUrlList(ans?.videolar),
                  ...normalizeKanitVideoUrlList(ans?.videos),
                  ...normalizeKanitVideoUrlList(ans?.video_urls),
                  ...normalizeKanitVideoUrlList(ans?.kanit_videolar),
                ])
              : []
            const stepVideos = stepVideosByJobId[next?.id] || []
            const mergedVideos = Array.from(
              new Set([...checklistVideos, ...stepVideos].filter(Boolean)),
            )
            if (mergedVideos.length) {
              next = {
                ...next,
                kanit_videolar: mergedVideos.map((url) => ({ url })),
              }
            }
          }

          return next
        })

        const fallbackMetricRows = jobsWithFallbackPhotos.map((j) => ({
          id: j.id,
          durum: j.durum,
          updated_at: j.updated_at,
          created_at: j.created_at,
          son_tarih: j.son_tarih,
          gorunur_tarih: j.gorunur_tarih,
          baslama_tarihi: j.baslama_tarihi,
          ana_sirket_id: j.ana_sirket_id,
          birim_id: j.birim_id,
          atayan_personel_id: j.atayan_personel_id,
          sorumlu_personel_id: j.sorumlu_personel_id,
          ozel_gorev: j.ozel_gorev,
          grup_id: j.grup_id,
          acil: j.acil,
          puan: j.puan,
          tamamlama_gecmisi: j.tamamlama_gecmisi,
          denetim_gecmisi: j.denetim_gecmisi,
        }))

        setCompanies(companiesData || [])
        setUnits(unitsData || [])
        setStaff(staffData || [])
        setJobs(jobsWithFallbackPhotos)

        const activeStaffCount = (staffData || []).filter(
          (s) => s.durum === true,
        ).length

        // KPI sayıları için görünürlükle tutarlı görev kümesi (liste mantığıyla aynı)
        let reconciledKpis = null
        let metricRowsVisible = (fallbackMetricRows || []).filter((t) =>
          isTaskVisibleNow(t) && isTaskVisibleToPerson(t, personel?.id),
        )
        try {
          // Kolon uyumsuzluğu kaynaklı 400 spam'ini önlemek için stabil alan seti
          const metricSelectStable =
            'id,durum,updated_at,created_at,son_tarih,ana_sirket_id,birim_id,atayan_personel_id,sorumlu_personel_id,ozel_gorev,grup_id,acil,puan,tamamlama_gecmisi,denetim_gecmisi'
          const { data: metricRows, error: metricErr } =
            await fetchAllScopedTasks(metricSelectStable)
          if (!metricErr) {
            const visibleRows = (metricRows || []).filter(
              (t) => isTaskVisibleNow(t) && isTaskVisibleToPerson(t, personel?.id),
            )
            metricRowsVisible = visibleRows
            setMetricJobs(visibleRows)
            const completedTodayVisible = visibleRows.filter((t) => {
              if (!isApprovedTaskStatus(t?.durum)) return false
              const ts = new Date(t?.updated_at || t?.created_at || 0)
              return !Number.isNaN(ts.getTime()) && ts >= todayStart && ts <= todayEnd
            }).length
            reconciledKpis = {
              totalTasks: visibleRows.length,
              pendingApprovals: visibleRows.filter((t) =>
                isPendingApprovalTaskStatus(t?.durum),
              ).length,
              completedToday: completedTodayVisible,
            }
          } else {
            console.error('KPI metric query warning', metricErr)
            setMetricJobs(metricRowsVisible)
          }
        } catch (metricComputeErr) {
          console.error('KPI reconcile warning', metricComputeErr)
          setMetricJobs(metricRowsVisible)
        }

        setKpis({
          totalTasks: reconciledKpis?.totalTasks ?? 0,
          activeStaff: activeStaffCount,
          pendingApprovals: reconciledKpis?.pendingApprovals ?? 0,
          completedToday: reconciledKpis?.completedToday ?? 0,
        })

        if (dashboardCacheKey) {
          try {
            window.sessionStorage.setItem(
              dashboardCacheKey,
              JSON.stringify({
                companies: companiesData || [],
                units: unitsData || [],
                staff: staffData || [],
                jobs: jobsWithFallbackPhotos || [],
                metricJobs: metricRowsVisible,
                kpis: {
                  totalTasks: reconciledKpis?.totalTasks ?? 0,
                  activeStaff: activeStaffCount,
                  pendingApprovals: reconciledKpis?.pendingApprovals ?? 0,
                  completedToday: reconciledKpis?.completedToday ?? 0,
                },
              }),
            )
          } catch (_) {
            // ignore cache write errors
          }
        }
        hasHydratedDataRef.current = true
      } catch (e) {
        console.error('AdminDashboard load error', e)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [
    canLoadWithScope,
    isSystemAdmin,
    currentCompanyId,
    JSON.stringify(accessibleUnitIds || []),
  ])

  // Realtime: tüm `isler` tablosunu dinlemek WebSocket ve sunucuda taşmaya yol açar.
  // Sistem yöneticisi: canlı dinleme yok (liste zaten sınırlı; gerekirse sayfayı yenileyin).
  // Şirket kullanıcıları: yalnızca kendi şirket satırları; birim kısıtı istemcide süzülür.
  useEffect(() => {
    if (isSystemAdmin || !currentCompanyId) return undefined

    const filter = `ana_sirket_id=eq.${currentCompanyId}`
    const channel = supabase
      .channel(`admin-dashboard-isler-${currentCompanyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'isler',
          filter,
        },
        (payload) => {
          const next = payload.new
          if (!next || !next.id) return
          if (
            accessibleUnitIds?.length &&
            next.birim_id != null &&
            !accessibleUnitIds.some(
              (id) => String(id) === String(next.birim_id),
            )
          ) {
            return
          }

          setJobs((prev) => {
            const idx = prev.findIndex((j) => j.id === next.id)
            if (idx === -1) {
              if (prev.length >= DASHBOARD_ISLER_LIMIT) {
                return prev
              }
              return [next, ...prev]
            }
            const clone = prev.slice()
            clone[idx] = { ...clone[idx], ...next }
            return clone
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isSystemAdmin, currentCompanyId, JSON.stringify(accessibleUnitIds || [])])

  const companyById = useMemo(
    () =>
      companies.reduce((acc, c) => {
        acc[c.id] = c
        return acc
      }, {}),
    [companies],
  )

  const scopedCompanyName = useMemo(() => {
    if (!companyScoped || !companies.length) return null
    return companies[0]?.ana_sirket_adi || null
  }, [companyScoped, companies])

  const unitById = useMemo(
    () =>
      units.reduce((acc, u) => {
        acc[u.id] = u
        return acc
      }, {}),
    [units],
  )

  const staffByCompany = useMemo(
    () =>
      staff.reduce((acc, s) => {
        if (!s.ana_sirket_id) return acc
        const key = s.ana_sirket_id
        if (!acc[key]) acc[key] = []
        acc[key].push(s)
        return acc
      }, {}),
    [staff],
  )

  const staffById = useMemo(
    () =>
      staff.reduce((acc, s) => {
        acc[s.id] = s
        return acc
      }, {}),
    [staff],
  )

  const dateRange = useMemo(
    () => resolveDateRange(dateFilter, customRangeStart, customRangeEnd),
    [dateFilter, customRangeStart, customRangeEnd],
  )

  const reportDateRange = useMemo(
    () => resolveDateRange(reportDateFilter, reportCustomRangeStart, reportCustomRangeEnd),
    [reportDateFilter, reportCustomRangeStart, reportCustomRangeEnd],
  )

  const isInDateRange = (rawDate) => isDateInRange(rawDate, dateRange)

  const canonicalMetricJobs = useMemo(
    () => ((metricJobs || []).length ? metricJobs : jobs),
    [metricJobs, jobs],
  )

  const metricView = useMemo(() => {
    const filtered = (canonicalMetricJobs || []).filter((t) =>
      isInDateRange(t?.updated_at || t?.created_at || t?.son_tarih),
    )
    const now = new Date()
    let pending = 0
    let overdue = 0
    let completed = 0
    for (const t of filtered) {
      if (isPendingApprovalTaskStatus(t?.durum)) pending += 1
      if (isApprovedTaskStatus(t?.durum)) completed += 1
      if (isOverdueTask(t, now)) overdue += 1
    }
    return {
      filtered,
      kpis: {
        totalTasks: filtered.length,
        pending,
        overdue,
        completed,
      },
    }
  }, [canonicalMetricJobs, dateRange])

  const filteredMetricJobs = metricView.filtered
  const derivedKpis = metricView.kpis

  const reportFilteredMetricJobs = useMemo(
    () =>
      (canonicalMetricJobs || []).filter((t) =>
        isDateInRange(t?.updated_at || t?.created_at || t?.son_tarih, reportDateRange),
      ),
    [canonicalMetricJobs, reportDateRange],
  )

  const jobsByGrupId = useMemo(() => {
    const map = new Map()
    for (const j of jobs || []) {
      if (!j?.grup_id) continue
      const gid = String(j.grup_id)
      if (!map.has(gid)) map.set(gid, [])
      map.get(gid).push(j)
    }
    return map
  }, [jobs])

  const reportSummary = useMemo(() => {
    const base = reportFilteredMetricJobs
    const total = base.length
    const completed = base.filter((j) => isApprovedTaskStatus(j.durum)).length
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

    const urgentJobs = base.filter((j) => j?.acil === true || j?.acil === 1)
    const urgentDone = urgentJobs.filter((j) => isApprovedTaskStatus(j.durum)).length
    const urgentCompletionRate =
      urgentJobs.length > 0 ? Math.round((urgentDone / urgentJobs.length) * 100) : 0

    const approvalDelays = base
      .map((j) => getCompletionToApprovalDelayMs(j))
      .filter((ms) => ms != null && ms > 0)
    const avgApprovalMs = approvalDelays.length
      ? approvalDelays.reduce((sum, ms) => sum + ms, 0) / approvalDelays.length
      : 0

    const totalPointsPossible = base.reduce(
      (sum, j) => sum + (Number(j.puan) > 0 ? Number(j.puan) : 0),
      0,
    )
    const earnedPoints = base
      .filter((j) => isApprovedTaskStatus(j.durum))
      .reduce((sum, j) => sum + (Number(j.puan) > 0 ? Number(j.puan) : 0), 0)
    const efficiencyScore =
      totalPointsPossible > 0
        ? Math.round((earnedPoints / totalPointsPossible) * 100)
        : 0

    const onTimeSamples = base
      .map((j) => isOnTimeApproved(j))
      .filter((v) => v != null)
    const onTimeCompletionRate = onTimeSamples.length
      ? Math.round(
          (onTimeSamples.filter(Boolean).length / onTimeSamples.length) * 100,
        )
      : 0

    const reviewPipeline = base.filter(enteredReviewPipeline)
    const resubmissionCount = reviewPipeline.filter(hadResubmission).length
    const resubmissionRate =
      reviewPipeline.length > 0
        ? Math.round((resubmissionCount / reviewPipeline.length) * 100)
        : 0

    return {
      completionRate,
      urgentCompletionRate,
      avgApprovalLabel: formatDurationTr(avgApprovalMs),
      efficiencyScore,
      onTimeCompletionRate,
      resubmissionRate,
    }
  }, [reportFilteredMetricJobs])

  useEffect(() => {
    const el = reportSummaryPanelRef.current
    if (!el) return
    const syncHeight = () => {
      setReportSummaryPanelHeight(Math.round(el.getBoundingClientRect().height))
    }
    syncHeight()
    const ro = new ResizeObserver(syncHeight)
    ro.observe(el)
    window.addEventListener('resize', syncHeight)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncHeight)
    }
  }, [reportDateFilter, reportCustomRangeStart, reportCustomRangeEnd, loading, reportSummary])

  const activityFeed = useMemo(() => {
    const sorted = (jobs || [])
      .slice()
      .sort((a, b) => {
        const da = new Date(a.updated_at || a.created_at || 0).getTime()
        const db = new Date(b.updated_at || b.created_at || 0).getTime()
        return db - da
      })
      .slice(0, ACTIVITY_FEED_LIMIT)
    return sorted.map((j) => {
      const company = companyById[j.ana_sirket_id]
      const companyName = company?.ana_sirket_adi || 'Bilinmeyen Şirket'
      const personName = resolveAssigneeDisplay(j, staffById, jobsByGrupId)
      const rel = formatRelativeTime(j.updated_at || j.created_at)
      const durum = normalizeTaskStatus(j.durum)
      const statusKey = String(durum || '').toLowerCase()
      let actionLabel = 'görev güncelledi'
      if (statusKey.includes('onaylandı') || statusKey.includes('tamam')) {
        actionLabel = 'görevi tamamladı'
      } else if (statusKey.includes('onay bekliyor')) {
        actionLabel = 'onaya gönderdi'
      } else if (statusKey.includes('redded')) {
        actionLabel = 'görev reddedildi'
      }
      return {
        id: j.id,
        title: formatTaskTitleCase(j.baslik || 'Görev'),
        company: companyName,
        person: personName,
        timeRelative: rel,
        status: durum || '—',
        actionLabel,
        isUrgent: j?.acil === true || j?.acil === 1,
        statusStyle: getActivityStatusStyle(durum),
      }
    })
  }, [jobs, companyById, staffById, jobsByGrupId])

  const urgentAlerts = useMemo(() => {
    const now = new Date()
    const pendingLong = filteredMetricJobs.filter((job) => {
      const normalized = normalizeTaskStatus(job.durum)
      if (!isPendingApprovalTaskStatus(normalized)) return false
      const ref = new Date(job.updated_at || job.created_at || 0)
      if (Number.isNaN(ref.getTime())) return false
      return now.getTime() - ref.getTime() >= 24 * 60 * 60 * 1000
    }).length

    const overdueCount = filteredMetricJobs.filter((job) =>
      isOverdueTask(job, now),
    ).length

    const resubmittedCount = filteredMetricJobs.filter(
      (job) => normalizeTaskStatus(job.durum) === TASK_STATUS.RESUBMITTED,
    ).length

    const items = []
    if (overdueCount > 0) {
      items.push({
        key: 'overdue',
        title: 'Geciken Görevler',
        detail: `${overdueCount} görev son tarihini geçti.`,
        count: overdueCount,
        status: null,
        alert: 'overdue',
        buttonLabel: 'Gecikenleri aç',
      })
    }
    if (pendingLong > 0) {
      items.push({
        key: 'pending-long',
        title: 'Uzun Süren Onay Bekleyişi',
        detail: `${pendingLong} görev 24 saattir onay bekliyor.`,
        count: pendingLong,
        status: TASK_STATUS.PENDING_APPROVAL,
        buttonLabel: 'Onay bekleyenlere git',
      })
    }
    if (resubmittedCount > 0) {
      items.push({
        key: 'resubmitted',
        title: 'Tekrar Gönderilen Görevler',
        detail: `${resubmittedCount} görev tekrar işlem bekliyor.`,
        count: resubmittedCount,
        status: TASK_STATUS.RESUBMITTED,
        buttonLabel: 'Tekrar gönderilenleri aç',
      })
    }
    return items
  }, [filteredMetricJobs])

  const urgentAlertTotalCount = useMemo(
    () => urgentAlerts.reduce((sum, item) => sum + (item.count || 0), 0),
    [urgentAlerts],
  )

  const liveFlowAll = useMemo(() => {
    const grouped = groupTasksByGrupId(jobs || []).items
    return grouped
      .slice()
      .sort((a, b) => {
        const da = new Date(a.updated_at || a.created_at || 0).getTime()
        const db = new Date(b.updated_at || b.created_at || 0).getTime()
        return db - da
      })
      .map((j) =>
        buildLiveFlowItem(j, { companyById, unitById, staffById, jobsByGrupId }),
      )
      .filter((item) => item.media?.length > 0)
      .slice(0, LIVE_FLOW_LIMIT)
  }, [jobs, companyById, unitById, staffById, jobsByGrupId])

  const liveFlowMaxPage = Math.max(
    0,
    Math.ceil(liveFlowAll.length / LIVE_FLOW_PAGE_SIZE) - 1,
  )

  const liveFlowPageItems = useMemo(() => {
    const start = liveFlowPage * LIVE_FLOW_PAGE_SIZE
    return liveFlowAll.slice(start, start + LIVE_FLOW_PAGE_SIZE)
  }, [liveFlowAll, liveFlowPage])

  useEffect(() => {
    setLiveFlowPage((p) => Math.min(p, liveFlowMaxPage))
  }, [liveFlowMaxPage])

  const goLiveFlowPage = (direction) => {
    if (direction === 'prev') {
      setLiveFlowPage((prev) => {
        if (prev <= 0) return prev
        setLiveFlowSlideDir('prev')
        setLiveFlowAnimTick((tick) => tick + 1)
        return prev - 1
      })
      return
    }
    setLiveFlowPage((prev) => {
      if (prev >= liveFlowMaxPage) return prev
      setLiveFlowSlideDir('next')
      setLiveFlowAnimTick((tick) => tick + 1)
      return prev + 1
    })
  }

  useEffect(() => {
    if (!previewVideo && !photoPreview) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (previewVideo) setPreviewVideo(null)
        if (photoPreview) closePhotoPreview()
        return
      }
      if (!photoPreview || photoPreview.urls.length < 2) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        stepPhotoPreview(-1)
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        stepPhotoPreview(1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [previewVideo, photoPreview])

  const kpiCards = useMemo(() => {
    const v = (n) => (loading ? '−' : n)
    return [
      {
        key: 'pending',
        label: 'Bekleyen Görevler',
        value: v(derivedKpis.pending),
        color: '#f59e0b',
        buttonColor: '#d97706',
        icon: Clock,
        buttonLabel: 'Bekleyenlere git',
        onClick: () =>
          navigate(`/admin/tasks?status=${encodeURIComponent(TASK_STATUS.PENDING_APPROVAL)}`),
      },
      {
        key: 'overdue',
        label: 'Geciken Görevler',
        value: v(derivedKpis.overdue),
        color: '#ef4444',
        buttonColor: '#dc2626',
        icon: AlertTriangle,
        buttonLabel: 'Gecikenlere git',
        onClick: () => navigate('/admin/tasks?alert=overdue'),
      },
      {
        key: 'completed',
        label: 'Tamamlanan Görevler',
        value: v(derivedKpis.completed),
        color: '#10b981',
        buttonColor: '#059669',
        icon: CheckCircle2,
        buttonLabel: 'Tamamlananlara git',
        onClick: () =>
          navigate(`/admin/tasks?status=${encodeURIComponent(TASK_STATUS.APPROVED)}`),
      },
      {
        key: 'all-tasks',
        label: 'Tüm Görevler',
        value: v(derivedKpis.totalTasks),
        color: cubicle.sidebarBg,
        buttonColor: cubicle.sidebarBg,
        icon: ClipboardList,
        buttonLabel: 'Tüm görevler',
        onClick: () => navigate('/admin/tasks'),
      },
    ]
  }, [loading, derivedKpis, navigate])

  const statusBadgeStyle = (status) => {
    const s = String(status || '').toLowerCase()
    let bg = '#e5e7eb'
    let color = '#374151'
    if (s.includes('tamam')) {
      bg = '#dcfce7'
      color = '#166534'
    } else if (s.includes('onay bekliyor') || s.includes('bekliyor')) {
      bg = '#fef3c7'
      color = '#92400e'
    } else if (s.includes('gecik') || s.includes('kritik')) {
      bg = '#fee2e2'
      color = '#b91c1c'
    }
    return {
      padding: '4px 10px',
      borderRadius: 9999,
      fontSize: 11,
      fontWeight: 600,
      backgroundColor: bg,
      color,
      textTransform: 'uppercase',
    }
  }

  return (
    <div
      style={{
        padding: '8px 0 20px',
        minHeight: '100%',
        position: 'relative',
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <style>{`
        @keyframes live-flow-slide-in-right {
          0% {
            opacity: 0;
            transform: translate3d(24px, 0, 0) scale(0.99);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }
        @keyframes live-flow-slide-in-left {
          0% {
            opacity: 0;
            transform: translate3d(-24px, 0, 0) scale(0.99);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }
      `}</style>
      <header style={{ marginBottom: 12, paddingTop: 4 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
          }}
        >
          <div
            style={{
              flex: '1 1 auto',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
            }}
          >
            <h1
              style={{
                fontSize: 26,
                fontWeight: 900,
                color: '#020617',
                letterSpacing: '-0.05em',
                margin: 0,
                lineHeight: 1.15,
              }}
            >
              {companyScoped
                ? scopedCompanyName
                  ? `${scopedCompanyName} — Yönetim Özeti`
                  : 'Şirket Yönetim Özeti'
                : 'Genel Yönetim Kokpiti'}
            </h1>
            <p
              style={{
                margin: '4px 0 0',
                color: '#64748b',
                fontSize: 12,
                lineHeight: 1.4,
                maxWidth: 640,
              }}
            >
              {companyScoped
                ? 'Yetkili olduğunuz şirket ve birimler için personel, onay ve görev özeti.'
                : 'Şirketler, personeller ve operasyonlar için canlı CEO paneli.'}
            </p>
            <div style={{ marginTop: 10, width: '100%', maxWidth: 720 }}>
              <div
                style={{
                  display: 'inline-flex',
                  flexWrap: 'wrap',
                  gap: 4,
                  padding: 5,
                  borderRadius: 14,
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  boxShadow:
                    'inset 0 1px 2px rgba(15,23,42,0.04), 0 1px 2px rgba(15,23,42,0.04)',
                }}
              >
                {KPI_DATE_FILTERS.map((opt) => {
                  const active = dateFilter === opt.key
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        setDateFilter(opt.key)
                        if (opt.key === 'custom') {
                          ensureCustomRangeDefaults(setCustomRangeStart, setCustomRangeEnd)
                        }
                      }}
                      style={{
                        fontSize: 12,
                        fontWeight: active ? 800 : 600,
                        padding: '8px 14px',
                        borderRadius: 10,
                        border: active
                          ? '1px solid #818cf8'
                          : '1px solid transparent',
                        backgroundColor: active ? '#ffffff' : 'transparent',
                        color: active ? '#3730a3' : '#64748b',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        boxShadow: active
                          ? '0 4px 14px -6px rgba(79,70,229,0.45), 0 1px 0 rgba(255,255,255,0.9) inset'
                          : 'none',
                        transition:
                          'background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
            {dateFilter === 'custom' ? (
              <div
                style={{
                  marginTop: 10,
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
                  Başlangıç
                  <input
                    type="date"
                    value={customRangeStart}
                    onChange={(e) => setCustomRangeStart(e.target.value)}
                    style={{
                      marginLeft: 6,
                      fontSize: 12,
                      padding: '6px 8px',
                      borderRadius: 10,
                      border: '1px solid #cbd5e1',
                    }}
                  />
                </label>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
                  Bitiş
                  <input
                    type="date"
                    value={customRangeEnd}
                    onChange={(e) => setCustomRangeEnd(e.target.value)}
                    style={{
                      marginLeft: 6,
                      fontSize: 12,
                      padding: '6px 8px',
                      borderRadius: 10,
                      border: '1px solid #cbd5e1',
                    }}
                  />
                </label>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  KPI kartları seçilen tarih aralığına göre güncellenir.
                </span>
              </div>
            ) : (
              <div style={{ margin: '8px 0 0', height: 15 }} aria-hidden="true" />
            )}
          </div>
          <aside
            style={{
              flex: '0 1 320px',
              minWidth: 260,
              borderRadius: 14,
              border: '1px solid #e2e8f0',
              backgroundColor: '#ffffff',
              boxShadow: '0 12px 32px -20px rgba(15,23,42,0.28)',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => setUrgentAlertsOpen((open) => !open)}
              aria-expanded={urgentAlertsOpen}
              aria-controls="urgent-alerts-panel"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '10px 12px',
                background:
                  'linear-gradient(120deg, #0f172a 0%, #7f1d1d 48%, #dc2626 100%)',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    backgroundColor: 'rgba(255,255,255,0.14)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fecaca',
                  }}
                >
                  <AlertTriangle size={18} strokeWidth={2.2} />
                </span>
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#fff',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    Acil Uyarılar
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(254,226,226,0.9)' }}>
                    {urgentAlertsOpen
                      ? 'Operasyon riskleri'
                      : urgentAlertTotalCount > 0
                        ? `${urgentAlertTotalCount} kayıt — genişletmek için tıklayın`
                        : 'Kritik uyarı yok'}
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                {urgentAlertTotalCount > 0 ? (
                  <span
                    style={{
                      minWidth: 24,
                      height: 24,
                      padding: '0 7px',
                      borderRadius: 9999,
                      backgroundColor: 'rgba(255,255,255,0.18)',
                      border: '1px solid rgba(255,255,255,0.28)',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {urgentAlertTotalCount}
                  </span>
                ) : null}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    backgroundColor: 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fecaca',
                  }}
                >
                  <ChevronDown
                    size={18}
                    strokeWidth={2.4}
                    style={{
                      transform: urgentAlertsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                    }}
                  />
                </span>
              </div>
            </button>
            {urgentAlertsOpen ? (
            <div
              id="urgent-alerts-panel"
              style={{
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                maxHeight: 168,
                overflowY: 'auto',
              }}
            >
              {urgentAlerts.length ? (
                urgentAlerts.map((item) => (
                  <div
                    key={item.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 8px 8px 10px',
                      borderRadius: 12,
                      border: '1px solid #f1f5f9',
                      background:
                        'linear-gradient(90deg, rgba(254,226,226,0.55) 0%, #ffffff 28%)',
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        minWidth: 36,
                        height: 36,
                        borderRadius: 10,
                        backgroundColor: '#fef2f2',
                        border: '1px solid #fecaca',
                        color: '#b91c1c',
                        fontSize: 14,
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {item.count}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#0f172a',
                          lineHeight: 1.3,
                          marginBottom: 2,
                        }}
                      >
                        {item.title}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.35 }}>
                        {item.detail}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          item.status
                            ? `/admin/tasks?status=${encodeURIComponent(item.status)}`
                            : item.alert
                              ? `/admin/tasks?alert=${encodeURIComponent(item.alert)}`
                              : '/admin/tasks',
                        )
                      }
                      style={{
                        flexShrink: 0,
                        border: 'none',
                        background: 'transparent',
                        color: '#dc2626',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: '4px 0',
                        textDecoration: 'underline',
                        textUnderlineOffset: 2,
                      }}
                    >
                      Git →
                    </button>
                  </div>
                ))
              ) : (
                <div
                  style={{
                    padding: '18px 12px',
                    textAlign: 'center',
                    fontSize: 12,
                    color: '#94a3b8',
                    borderRadius: 12,
                    border: '1px dashed #e2e8f0',
                    backgroundColor: '#f8fafc',
                  }}
                >
                  Şu anda kritik acil uyarı yok.
                </div>
              )}
            </div>
            ) : null}
          </aside>

        </div>
      </header>

      {/* Üst KPI şeridi */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        {kpiCards.map((card) => {
          const CardIcon = card.icon
          return (
            <div
              key={card.key}
              style={{
                position: 'relative',
                backgroundColor: '#ffffff',
                borderRadius: 14,
                border: '1px solid #e2e8f0',
                boxShadow: '0 8px 24px -12px rgba(15,23,42,0.14)',
                padding: '12px 13px 13px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  backgroundColor: card.color,
                  borderRadius: '14px 0 0 14px',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 8,
                  paddingLeft: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#475569',
                    lineHeight: 1.35,
                    letterSpacing: '0.02em',
                    paddingTop: 2,
                  }}
                >
                  {card.label}
                </span>
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    backgroundColor: `${card.color}14`,
                    border: `1px solid ${card.color}30`,
                    color: card.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <CardIcon size={16} strokeWidth={2.2} />
                </span>
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: '#0f172a',
                  lineHeight: 1,
                  letterSpacing: '-0.03em',
                  paddingLeft: 4,
                }}
              >
                {card.value}
              </div>
              <button
                type="button"
                onClick={card.onClick}
                style={{
                  alignSelf: 'flex-start',
                  marginLeft: 4,
                  borderRadius: 8,
                  border: `1px solid ${card.color}45`,
                  backgroundColor: `${card.color}18`,
                  color: card.buttonColor,
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '5px 11px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  backdropFilter: 'blur(6px)',
                  boxShadow: `0 2px 8px -4px ${card.color}40`,
                }}
              >
                {card.buttonLabel}
                <ArrowRight size={11} strokeWidth={2.5} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Canlı Görev Akışı */}
      <div
        style={{
          marginBottom: 16,
          backgroundColor: '#ffffff',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          boxShadow: '0 6px 20px -14px rgba(15,23,42,0.18)',
          padding: '12px 14px',
        }}
      >
        <div
          style={{
            marginBottom: 10,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#0f172a',
                }}
              >
                Canlı Görev Akışı
              </h2>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 9999,
                  backgroundColor: 'rgba(16,185,129,0.08)',
                  border: '1px solid rgba(16,185,129,0.3)',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '9999px',
                    backgroundColor: '#22c55e',
                    boxShadow: '0 0 8px rgba(34,197,94,0.9)',
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: '#047857',
                  }}
                >
                  Canlı
                </span>
              </div>
            </div>
            <p
              style={{
                fontSize: 12,
                color: '#6b7280',
                marginTop: 2,
              }}
            >
              Tarih filtresinden bağımsız; kanıtlı son {LIVE_FLOW_LIMIT} görev
            </p>
          </div>
          <span
            style={{
              fontSize: 11,
              color: '#9ca3af',
              padding: '4px 10px',
              borderRadius: 9999,
              border: '1px solid rgba(148,163,184,0.45)',
              backgroundColor: 'rgba(15,23,42,0.03)',
            }}
          >
            {liveFlowAll.length} görev · {liveFlowPage + 1}/{liveFlowMaxPage + 1}
          </span>
        </div>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            aria-label="Önceki görevler"
            disabled={liveFlowPage <= 0}
            onClick={() => goLiveFlowPage('prev')}
            style={{
              position: 'absolute',
              left: -6,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: '1px solid #e2e8f0',
              backgroundColor: '#fff',
              boxShadow: '0 4px 12px rgba(15,23,42,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: liveFlowPage <= 0 ? 'not-allowed' : 'pointer',
              opacity: liveFlowPage <= 0 ? 0.4 : 1,
            }}
          >
            <ChevronLeft size={18} color="#475569" />
          </button>
          <button
            type="button"
            aria-label="Sonraki görevler"
            disabled={liveFlowPage >= liveFlowMaxPage}
            onClick={() => goLiveFlowPage('next')}
            style={{
              position: 'absolute',
              right: -6,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: '1px solid #e2e8f0',
              backgroundColor: '#fff',
              boxShadow: '0 4px 12px rgba(15,23,42,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: liveFlowPage >= liveFlowMaxPage ? 'not-allowed' : 'pointer',
              opacity: liveFlowPage >= liveFlowMaxPage ? 0.4 : 1,
            }}
          >
            <ChevronRight size={18} color="#475569" />
          </button>
          <div
            style={{
              overflow: 'hidden',
              padding: '4px 28px 8px',
            }}
          >
            <div
              key={`${liveFlowPage}-${liveFlowAnimTick}`}
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${LIVE_FLOW_PAGE_SIZE}, minmax(0, 1fr))`,
                gap: 14,
                alignItems: 'start',
              }}
            >
              {liveFlowPageItems.map((item, cardIdx) => (
                <div
                  key={item.id}
                  style={{
                    minWidth: 0,
                    minHeight: 0,
                    borderRadius: 10,
                    background: '#fff',
                    boxShadow: '0 6px 16px -10px rgba(15,23,42,0.35)',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: 12,
                    willChange: 'transform, opacity',
                    animation:
                      liveFlowSlideDir === 'next'
                        ? 'live-flow-slide-in-right 360ms cubic-bezier(0.25, 0.9, 0.3, 1) both'
                        : 'live-flow-slide-in-left 360ms cubic-bezier(0.25, 0.9, 0.3, 1) both',
                    animationDelay: `${cardIdx * 40}ms`,
                  }}
                >
                  <div
                    title={item.titleFull}
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#111827',
                      letterSpacing: '-0.01em',
                      marginBottom: 6,
                      lineHeight: 1.3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {item.titleFull}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      fontSize: 12,
                      color: '#6b7280',
                      marginBottom: 8,
                      flexShrink: 0,
                    }}
                  >
                    {!companyScoped && (
                      <div
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={item.company}
                      >
                        <span style={{ marginRight: 4 }}>🏢</span>
                        <span>{item.company}</span>
                      </div>
                    )}
                    <div
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={item.person}
                    >
                      <span style={{ marginRight: 4 }}>👨‍💼</span>
                      <span>{item.person}</span>
                    </div>
                    {item.unit ? (
                      <div
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={item.unit}
                      >
                        <span style={{ marginRight: 4 }}>🏬</span>
                        <span>{item.unit}</span>
                      </div>
                    ) : null}
                  </div>

                  {item.media?.length > 0 ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                        gap: 6,
                        height: 82,
                        marginBottom: 0,
                        flexShrink: 0,
                      }}
                    >
                      {(item.media || []).map((m, idx) => (
                        <div
                          key={`${item.id}-m-${idx}`}
                          style={{
                            borderRadius: 8,
                            overflow: 'hidden',
                            backgroundColor: '#0f172a',
                            position: 'relative',
                            minHeight: 82,
                          }}
                        >
                          {m.type === 'video' ? (
                            <>
                              <video
                                src={m.url}
                                muted
                                playsInline
                                preload="metadata"
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  minHeight: 82,
                                  objectFit: 'cover',
                                  display: 'block',
                                  pointerEvents: 'none',
                                }}
                              />
                              <button
                                type="button"
                                aria-label="Videoyu tam ekran oynat"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  closePhotoPreview()
                                  setPreviewVideo(m.url)
                                }}
                                style={{
                                  position: 'absolute',
                                  inset: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  border: 'none',
                                  backgroundColor: 'rgba(15,23,42,0.35)',
                                  cursor: 'pointer',
                                  padding: 0,
                                }}
                              >
                                <span
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: '50%',
                                    backgroundColor: 'rgba(255,255,255,0.92)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                                  }}
                                >
                                  <Play
                                    size={16}
                                    fill="#0f172a"
                                    color="#0f172a"
                                    style={{ marginLeft: 2 }}
                                  />
                                </span>
                              </button>
                            </>
                          ) : (
                            <img
                              src={m.url}
                              alt="Görev kanıtı"
                              onClick={() => openPhotoPreview(item, m.url)}
                              style={{
                                width: '100%',
                                height: '100%',
                                minHeight: 82,
                                objectFit: 'cover',
                                display: 'block',
                                cursor: 'pointer',
                              }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div
                    style={{
                      marginTop: item.media?.length > 0 ? 8 : 10,
                      flexShrink: 0,
                      display: 'flex',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/admin/tasks/${encodeURIComponent(item.id)}`)
                      }
                      style={{
                        padding: '7px 12px',
                        borderRadius: 8,
                        border: 'none',
                        backgroundColor: cubicle.sidebarBg,
                        color: '#ffffff',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px -2px rgba(37,99,235,0.45)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      Detay gör
                      <ArrowRight size={13} strokeWidth={2.4} />
                    </button>
                  </div>
                </div>
              ))}

              {!liveFlowAll.length && !loading ? (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    fontSize: 11,
                    color: '#9ca3af',
                    padding: '12px 0',
                  }}
                >
                  Henüz canlı görev akışı bulunmuyor.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      {/* Orta panel: rapor özeti (doğal yükseklik) + kaydırılabilir iş listesi */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          marginBottom: 16,
          alignItems: 'flex-start',
        }}
      >
        <section
          ref={reportSummaryPanelRef}
          style={{
            flex: '1.45 1 0',
            minWidth: 0,
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
            boxShadow: '0 8px 24px -12px rgba(15,23,42,0.14)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              background:
                'linear-gradient(135deg, #1e1b4b 0%, #312e81 42%, #4338ca 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  backgroundColor: 'rgba(255,255,255,0.14)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#c7d2fe',
                  flexShrink: 0,
                }}
              >
                <BarChart3 size={16} strokeWidth={2.2} />
              </span>
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 14,
                    fontWeight: 800,
                    color: '#ffffff',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2,
                  }}
                >
                  Rapor Özeti
                </h2>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: 10,
                    color: 'rgba(199,210,254,0.92)',
                    lineHeight: 1.35,
                  }}
                >
                  Tamamlanma, teslim disiplini ve kalite
                </p>
              </div>
            </div>
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 3,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'rgba(224,231,255,0.9)',
                }}
              >
                KPI dönemi
              </span>
              <select
                value={reportDateFilter}
                onChange={(e) => {
                  const key = e.target.value
                  setReportDateFilter(key)
                  if (key === 'custom') {
                    ensureCustomRangeDefaults(
                      setReportCustomRangeStart,
                      setReportCustomRangeEnd,
                    )
                  }
                }}
                aria-label="Rapor özeti tarih dönemi"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#312e81',
                  padding: '6px 28px 6px 10px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.35)',
                  backgroundColor: '#ffffff',
                  cursor: 'pointer',
                  minWidth: 148,
                  boxShadow: '0 4px 12px -4px rgba(15,23,42,0.35)',
                  appearance: 'auto',
                }}
              >
                {KPI_DATE_FILTERS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {reportDateFilter === 'custom' ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                backgroundColor: 'rgba(255,255,255,0.06)',
                borderBottom: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              <label style={{ fontSize: 10, fontWeight: 700, color: '#e0e7ff' }}>
                Başlangıç
                <input
                  type="date"
                  value={reportCustomRangeStart}
                  onChange={(e) => setReportCustomRangeStart(e.target.value)}
                  style={{
                    marginLeft: 6,
                    fontSize: 11,
                    padding: '5px 8px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.25)',
                    backgroundColor: '#fff',
                    color: '#1e293b',
                  }}
                />
              </label>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#e0e7ff' }}>
                Bitiş
                <input
                  type="date"
                  value={reportCustomRangeEnd}
                  onChange={(e) => setReportCustomRangeEnd(e.target.value)}
                  style={{
                    marginLeft: 6,
                    fontSize: 11,
                    padding: '5px 8px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.25)',
                    backgroundColor: '#fff',
                    color: '#1e293b',
                  }}
                />
              </label>
            </div>
          ) : null}
          <div
            style={{
              padding: 10,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 8,
              alignContent: 'start',
            }}
          >
            {[
              {
                key: 'completion',
                label: 'Tamamlanan görev oranı',
                value: reportSummary.completionRate,
                suffix: '%',
                color: '#10b981',
                icon: TrendingUp,
                showBar: true,
              },
              {
                key: 'urgent',
                label: 'Tamamlanan acil görev oranı',
                value: reportSummary.urgentCompletionRate,
                suffix: '%',
                color: '#ef4444',
                icon: Zap,
                showBar: true,
              },
              {
                key: 'approval',
                label: 'Ortalama onay süresi',
                value: reportSummary.avgApprovalLabel,
                suffix: '',
                color: '#6366f1',
                icon: Clock,
                showBar: false,
                hint: 'Tamamlanmadan onaya kadar (sistem geneli)',
              },
              {
                key: 'efficiency',
                label: 'Verimlilik skoru',
                value: reportSummary.efficiencyScore,
                suffix: '%',
                color: '#f59e0b',
                icon: Target,
                showBar: true,
                hint: 'Alınan puan / olası puan toplamı',
              },
              {
                key: 'on-time',
                label: 'Zamanında tamamlama oranı',
                value: reportSummary.onTimeCompletionRate,
                suffix: '%',
                color: '#0ea5e9',
                icon: CalendarCheck,
                showBar: true,
                hint: 'Son tarihli onaylı görevlerde zamanında onay',
              },
              {
                key: 'resubmission',
                label: 'Yeniden gönderim oranı',
                value: reportSummary.resubmissionRate,
                suffix: '%',
                color: '#8b5cf6',
                icon: RotateCcw,
                showBar: true,
                hint: 'Onay sürecine giren işlerde revizyon payı',
              },
            ].map((m) => {
              const Icon = m.icon
              const numeric =
                typeof m.value === 'number' ? m.value : parseInt(String(m.value), 10)
              const barWidth =
                m.showBar && !Number.isNaN(numeric)
                  ? Math.min(100, Math.max(0, numeric))
                  : 0
              return (
                <div
                  key={m.key}
                  style={{
                    padding: '10px 10px 9px',
                    borderRadius: 12,
                    border: '1px solid #f1f5f9',
                    backgroundColor: '#fafafa',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: '#64748b',
                          lineHeight: 1.3,
                          marginBottom: 4,
                        }}
                      >
                        {formatTaskTitleCase(m.label)}
                      </div>
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 800,
                          color: '#0f172a',
                          letterSpacing: '-0.03em',
                          lineHeight: 1,
                        }}
                      >
                        {m.value}
                        {m.suffix}
                      </div>
                    </div>
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 10,
                        backgroundColor: `${m.color}18`,
                        color: m.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={15} strokeWidth={2.2} />
                    </span>
                  </div>
                  {m.showBar ? (
                    <div
                      style={{
                        height: 4,
                        borderRadius: 9999,
                        backgroundColor: '#e2e8f0',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${barWidth}%`,
                          height: '100%',
                          borderRadius: 9999,
                          backgroundColor: m.color,
                        }}
                      />
                    </div>
                  ) : null}
                  {m.hint ? (
                    <div style={{ fontSize: 9, color: '#94a3b8', lineHeight: 1.3 }}>{m.hint}</div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>

          <div
            style={{
              flex: '1 1 0',
              minWidth: 0,
              height: reportSummaryPanelHeight ?? undefined,
              backgroundColor: '#ffffff',
              borderRadius: 14,
              border: '1px solid #e2e8f0',
              boxShadow: '0 8px 24px -12px rgba(15,23,42,0.14)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '8px 10px',
                flexShrink: 0,
                background:
                  'linear-gradient(120deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 12,
                    fontWeight: 800,
                    color: '#fff',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2,
                  }}
                >
                  Son Gönderilen İşler
                </h2>
                <p
                  style={{
                    margin: '1px 0 0',
                    fontSize: 9,
                    color: 'rgba(226,232,240,0.85)',
                  }}
                >
                  Canlı aktivite akışı
                </p>
              </div>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#e2e8f0',
                  padding: '3px 7px',
                  borderRadius: 9999,
                  border: '1px solid rgba(255,255,255,0.18)',
                  backgroundColor: 'rgba(255,255,255,0.08)',
                }}
              >
                {activityFeed.length} kayıt
              </span>
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                padding: 8,
                overflowY: 'auto',
                overflowX: 'hidden',
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                justifyContent: 'flex-start',
              }}
            >
            {activityFeed.length ? (
                activityFeed.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      navigate(`/admin/tasks/${encodeURIComponent(item.id)}`)
                    }
                    style={{
                      textAlign: 'left',
                      width: '100%',
                      border: `1px solid ${item.statusStyle.border}`,
                      borderRadius: 10,
                      backgroundColor: '#ffffff',
                      padding: '7px 9px 7px 11px',
                      cursor: 'pointer',
                      display: 'flex',
                      gap: 8,
                      alignItems: 'stretch',
                      boxShadow: '0 2px 8px -8px rgba(15,23,42,0.1)',
                    }}
                  >
                    <span
                      style={{
                        width: 3,
                        borderRadius: 9999,
                        backgroundColor: item.statusStyle.color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 6,
                        marginBottom: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#0f172a',
                          lineHeight: 1.3,
                        }}
                      >
                        {item.title}
                      </span>
                      {item.isUrgent ? (
                        <span
                          style={{
                            flexShrink: 0,
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: '#b91c1c',
                            backgroundColor: '#fee2e2',
                            border: '1px solid #fecaca',
                            borderRadius: 9999,
                            padding: '2px 6px',
                          }}
                        >
                          Acil
                        </span>
                      ) : null}
                    </div>
                    <p
                      style={{
                        margin: '0 0 4px',
                        fontSize: 10,
                        color: '#475569',
                        lineHeight: 1.35,
                      }}
                    >
                      <strong style={{ color: '#111827' }}>{item.person}</strong>{' '}
                      {item.actionLabel}
                      {!companyScoped ? (
                        <>
                          {' · '}
                          <span style={{ color: '#64748b' }}>{item.company}</span>
                        </>
                      ) : null}
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: item.statusStyle.color,
                          backgroundColor: item.statusStyle.bg,
                          border: `1px solid ${item.statusStyle.border}`,
                          borderRadius: 9999,
                          padding: '2px 6px',
                        }}
                      >
                        {item.status}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          color: '#94a3b8',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        {item.timeRelative}
                        <ArrowRight size={11} strokeWidth={2.5} color="#94a3b8" />
                      </span>
                    </div>
                    </span>
                  </button>
                ))
            ) : (
              <div
                style={{
                  fontSize: 11,
                  color: '#9ca3af',
                  padding: '12px 6px',
                  textAlign: 'center',
                }}
              >
                Henüz işlem kaydı bulunmuyor.
              </div>
            )}
            </div>
          </div>

      </div>

      {/* Fotoğraf önizleme (modal) */}
      {photoPreview ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Fotoğraf önizleme"
          onClick={closePhotoPreview}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9998,
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '92vw',
              maxHeight: '90vh',
              borderRadius: 20,
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
              border: '1px solid #1f2937',
              backgroundColor: '#020617',
            }}
          >
            <button
              type="button"
              aria-label="Kapat"
              onClick={closePhotoPreview}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                zIndex: 3,
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: 'none',
                backgroundColor: 'rgba(15,23,42,0.65)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </button>
            {photoPreview.urls.length > 1 ? (
              <>
                <button
                  type="button"
                  aria-label="Önceki fotoğraf"
                  onClick={(e) => {
                    e.stopPropagation()
                    stepPhotoPreview(-1)
                  }}
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 3,
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    border: 'none',
                    backgroundColor: 'rgba(15,23,42,0.65)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronLeft size={22} />
                </button>
                <button
                  type="button"
                  aria-label="Sonraki fotoğraf"
                  onClick={(e) => {
                    e.stopPropagation()
                    stepPhotoPreview(1)
                  }}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 3,
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    border: 'none',
                    backgroundColor: 'rgba(15,23,42,0.65)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronRight size={22} />
                </button>
                <span
                  style={{
                    position: 'absolute',
                    bottom: 10,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 3,
                    padding: '4px 10px',
                    borderRadius: 9999,
                    backgroundColor: 'rgba(15,23,42,0.65)',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {photoPreview.index + 1} / {photoPreview.urls.length}
                </span>
              </>
            ) : null}
            <img
              key={photoPreview.urls[photoPreview.index]}
              src={photoPreview.urls[photoPreview.index]}
              alt="Büyük görev görseli"
              style={{
                display: 'block',
                maxWidth: '92vw',
                maxHeight: '90vh',
                objectFit: 'contain',
              }}
            />
          </div>
        </div>
      ) : null}

      {previewVideo ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Video önizleme"
          onClick={() => setPreviewVideo(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: 'min(92vw, 960px)',
              maxHeight: '85vh',
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.55)',
              border: '1px solid #1f2937',
              backgroundColor: '#020617',
            }}
          >
            <button
              type="button"
              aria-label="Kapat"
              onClick={() => setPreviewVideo(null)}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                zIndex: 2,
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: 'none',
                backgroundColor: 'rgba(15,23,42,0.65)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </button>
            <video
              key={previewVideo}
              src={previewVideo}
              controls
              autoPlay
              playsInline
              controlsList="nofullscreen noremoteplayback"
              disablePictureInPicture
              style={{
                display: 'block',
                width: '100%',
                maxHeight: '85vh',
                objectFit: 'contain',
                backgroundColor: '#000',
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function AdminDashboard() {
  const { profile } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const permissions = profile?.yetkiler || {}
  if (!hasManagementDashboardAccess(permissions, isSystemAdmin)) {
    return <CubicleHome embedded />
  }
  return <AdminDashboardKokpit />
}
