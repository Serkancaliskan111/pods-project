import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import getSupabase from '../../lib/supabaseClient'
import { AuthContext } from '../../contexts/AuthContext.jsx'
import { hasManagementDashboardAccess } from '../../lib/permissions.js'
import {
  DASHBOARD_ISLER_LIMIT,
  scopeAnaSirketlerQuery,
  scopeBirimlerQuery,
  scopeIslerQuery,
  scopePersonelQuery,
} from '../../lib/supabaseScope.js'
import { formatTimestampForFilter } from '../../lib/postgrestFilters.js'
import TaskOperatorHome from './TaskOperatorHome.jsx'
import {
  TASK_STATUS,
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
  normalizeTaskStatus,
} from '../../lib/taskStatus.js'
import { isTaskVisibleNow, isTaskVisibleToPerson } from '../../lib/taskVisibility.js'

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
  const [previewPhoto, setPreviewPhoto] = useState(null)
  const [selectedAnalyticsCompany, setSelectedAnalyticsCompany] =
    useState('all')
  const [dateFilter, setDateFilter] = useState('today') // 'today' | '7d' | '30d' | 'custom' | 'all'
  const [customRangeStart, setCustomRangeStart] = useState('')
  const [customRangeEnd, setCustomRangeEnd] = useState('')
  const [announcements, setAnnouncements] = useState([])
  const [announcementIndex, setAnnouncementIndex] = useState(0)
  const [announcementSlideDir, setAnnouncementSlideDir] = useState('next')
  const [announcementAnimTick, setAnnouncementAnimTick] = useState(0)
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
      if (Array.isArray(parsed.announcements)) setAnnouncements(parsed.announcements)
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
      const scope = {
        isSystemAdmin,
        currentCompanyId,
        accessibleUnitIds,
      }
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
          { data: announcementsData, error: announcementsErr },
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
          (() => {
            let q = supabase
              .from('duyurular')
              .select('id, metin, created_at, gonderen_personel_id, ana_sirket_id')
              .order('created_at', { ascending: false })
              .limit(8)
            if (!isSystemAdmin && currentCompanyId) {
              q = q.eq('ana_sirket_id', currentCompanyId)
            }
            return q
          })(),
        ])

        if (compErr || staffErr || unitsErr || announcementsErr) {
          console.error(compErr || staffErr || unitsErr || announcementsErr)
          setLoading(false)
          return
        }

        // 2. aşama: ağır görev listesi — üst sınır + sıralama (tüm tabloyu çekme)
        let jobsQ = scopeIslerQuery(
          supabase
            .from('isler')
            .select(
              'id,baslik,durum,aciklama,updated_at,created_at,son_tarih,ana_sirket_id,birim_id,sorumlu_personel_id,atayan_personel_id,ozel_gorev,kanit_resim_ler,checklist_cevaplari,gorev_turu,acil',
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
        if (chainJobIds.length) {
          let { data: chainSteps, error: chainStepsErr } = await supabase
            .from('isler_zincir_gorev_adimlari')
            .select('is_id,adim_no,kanit_resim_ler,kanit_foto_durumlari')
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
            const photos = [
              ...normalizePhotoList(step?.kanit_resim_ler),
              ...normalizePhotoList(step?.kanit_foto_durumlari),
            ]
            if (!photos.length) return
            const existing = stepPhotosByJobId[jobId] || []
            stepPhotosByJobId[jobId] = Array.from(new Set([...existing, ...photos]))
          })
        }

        const jobsWithFallbackPhotos = baseJobs.map((job) => {
          const directPhotos = normalizePhotoList(job?.kanit_resim_ler)
          if (directPhotos.length) return job

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
          if (checklistPhotos.length) {
            return { ...job, kanit_resim_ler: checklistPhotos }
          }

          const stepPhotos = stepPhotosByJobId[job?.id] || []
          if (stepPhotos.length) {
            return { ...job, kanit_resim_ler: stepPhotos }
          }
          return job
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
        }))

        setCompanies(companiesData || [])
        setUnits(unitsData || [])
        setStaff(staffData || [])
        setAnnouncements(announcementsData || [])
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
            'id,durum,updated_at,created_at,son_tarih,ana_sirket_id,birim_id,atayan_personel_id,sorumlu_personel_id,ozel_gorev'
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
                announcements: announcementsData || [],
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

  useEffect(() => {
    if (companyScoped && currentCompanyId) {
      setSelectedAnalyticsCompany(String(currentCompanyId))
    } else if (isSystemAdmin) {
      setSelectedAnalyticsCompany('all')
    }
  }, [companyScoped, currentCompanyId, isSystemAdmin])

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

  const dateRange = useMemo(() => {
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
  }, [dateFilter, customRangeStart, customRangeEnd])

  const isInDateRange = (rawDate) => {
    if (!dateRange) return true
    if (!rawDate) return false
    const d = new Date(rawDate)
    if (Number.isNaN(d.getTime())) return false
    return d >= dateRange.start && d <= dateRange.end
  }

  const canonicalMetricJobs = useMemo(
    () => ((metricJobs || []).length ? metricJobs : jobs),
    [metricJobs, jobs],
  )

  const metricView = useMemo(() => {
    const filtered = (canonicalMetricJobs || []).filter((t) =>
      isInDateRange(t?.updated_at || t?.created_at || t?.son_tarih),
    )
    let pendingApprovals = 0
    let completed = 0
    for (const t of filtered) {
      if (isPendingApprovalTaskStatus(t?.durum)) pendingApprovals += 1
      if (isApprovedTaskStatus(t?.durum)) completed += 1
    }
    return {
      filtered,
      kpis: {
        totalTasks: filtered.length,
        pendingApprovals,
        completed,
      },
    }
  }, [canonicalMetricJobs, dateRange])

  const filteredMetricJobs = metricView.filtered
  const derivedKpis = metricView.kpis

  const jobsByCompany = useMemo(
    () =>
      filteredMetricJobs.reduce((acc, j) => {
        if (!j.ana_sirket_id) return acc
        const key = j.ana_sirket_id
        if (!acc[key]) acc[key] = []
        acc[key].push(j)
        return acc
      }, {}),
    [filteredMetricJobs],
  )

  const topCompanySummaries = useMemo(() => {
    if (!companies.length) return []

    return companies
      .map((c) => {
        const list = jobsByCompany[c.id] || []
        const total = list.length
        const completed = list.filter((j) => isApprovedTaskStatus(j.durum)).length
        const rate = total > 0 ? Math.round((completed / total) * 100) : 0
        return {
          id: c.id,
          name: c.ana_sirket_adi,
          vergiNo: c.vergi_no || '-',
          total,
          completionRate: rate,
        }
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  }, [companies, jobsByCompany])

  const activityFeed = useMemo(() => {
    const filtered = jobs.filter((j) =>
      isInDateRange(j.updated_at || j.created_at || j.son_tarih),
    )
    const sorted = filtered
      .slice()
      .sort((a, b) => {
        const da = new Date(a.updated_at || a.created_at || 0).getTime()
        const db = new Date(b.updated_at || b.created_at || 0).getTime()
        return db - da
      })
      .slice(0, 15)
    return sorted.map((j) => {
      const company = companyById[j.ana_sirket_id]
      const personList = staffByCompany[j.ana_sirket_id] || []
      const person = personList.find((p) => p.id === j.sorumlu_personel_id)
      const companyName = company?.ana_sirket_adi || 'Bilinmeyen Şirket'
      const personName =
        person && (person.ad || person.soyad)
          ? `${person.ad || ''} ${person.soyad || ''}`.trim()
          : person?.email || 'Bilinmeyen Personel'
      const rel = formatRelativeTime(j.updated_at || j.created_at)
      const durum = normalizeTaskStatus(j.durum)
      return {
        id: j.id,
        islem: j.baslik || 'Görev',
        company: companyName,
        person: personName,
        timeRelative: rel,
        status: durum || '-',
      }
    })
  }, [jobs, companyById, staffByCompany, dateRange])

  const analytics = useMemo(() => {
    const baseJobsAll = filteredMetricJobs

    const baseJobs =
      selectedAnalyticsCompany === 'all'
        ? baseJobsAll
        : baseJobsAll.filter(
            (j) =>
              String(j.ana_sirket_id) === String(selectedAnalyticsCompany),
          )

    const total = baseJobs.length
    const completed = baseJobs.filter((j) => isApprovedTaskStatus(j.durum)).length
    const waitingApproval = baseJobs.filter(
      (j) => isPendingApprovalTaskStatus(j.durum),
    ).length
    const overdue = baseJobs.filter((j) => isOverdueTask(j)).length
    const rejected = baseJobs.filter(
      (j) => normalizeTaskStatus(j.durum) === TASK_STATUS.REJECTED,
    ).length
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0
    return { total, completed, waitingApproval, overdue, rejected, completionRate }
  }, [filteredMetricJobs, selectedAnalyticsCompany])

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

  const recentAnnouncements = useMemo(
    () =>
      (announcements || []).map((a) => {
        const sender = a?.gonderen_personel_id
          ? staffById[a.gonderen_personel_id]
          : null
        const senderName =
          sender && (sender.ad || sender.soyad)
            ? `${sender.ad || ''} ${sender.soyad || ''}`.trim()
            : sender?.email || 'Yönetici'
        const companyName = a?.ana_sirket_id
          ? companyById[a.ana_sirket_id]?.ana_sirket_adi || 'Bilinmeyen Şirket'
          : 'Bilinmeyen Şirket'
        return {
          id: a.id,
          text: a.metin || '-',
          senderName,
          companyName,
          timeRelative: formatRelativeTime(a.created_at),
        }
      }),
    [announcements, staffById, companyById],
  )

  useEffect(() => {
    if (!recentAnnouncements.length) {
      setAnnouncementIndex(0)
      return
    }
    setAnnouncementIndex((prev) =>
      Math.max(0, Math.min(prev, recentAnnouncements.length - 1)),
    )
  }, [recentAnnouncements.length])

  const goToAnnouncement = (direction) => {
    if (!recentAnnouncements.length) return
    if (direction === 'prev') {
      setAnnouncementIndex((prev) => {
        if (prev <= 0) return prev
        setAnnouncementSlideDir('prev')
        setAnnouncementAnimTick((tick) => tick + 1)
        return prev - 1
      })
      return
    }
    setAnnouncementIndex((prev) => {
      if (prev >= recentAnnouncements.length - 1) return prev
      setAnnouncementSlideDir('next')
      setAnnouncementAnimTick((tick) => tick + 1)
      return prev + 1
    })
  }

  const liveFlow = useMemo(
    () =>
      jobs
        .filter(
          (j) =>
            isInDateRange(j.updated_at || j.created_at || j.son_tarih) &&
            isApprovedTaskStatus(j.durum),
        )
        .slice()
        .sort((a, b) => {
          const da = new Date(a.updated_at || a.created_at || 0).getTime()
          const db = new Date(b.updated_at || b.created_at || 0).getTime()
          return db - da
        })
        .slice(0, 20)
        .map((j) => {
          const company = companyById[j.ana_sirket_id]
          const unit = j.birim_id ? unitById[j.birim_id] : null
          const person =
            (j.sorumlu_personel_id && staffById[j.sorumlu_personel_id]) ||
            null

          let companyName = ''
          if (company && company.ana_sirket_adi) {
            companyName = company.ana_sirket_adi
          } else {
            // Farklı kaynaklardan şirketi tahmin etmeye çalış
            let guessedCompanyId = j.ana_sirket_id || null
            if (!guessedCompanyId && unit?.ana_sirket_id) {
              guessedCompanyId = unit.ana_sirket_id
            }
            if (!guessedCompanyId && person?.ana_sirket_id) {
              guessedCompanyId = person.ana_sirket_id
            }
            const guessedCompany =
              (guessedCompanyId && companyById[guessedCompanyId]) || null
            companyName =
              guessedCompany?.ana_sirket_adi ||
              j.ana_sirket_adi ||
              j.sirket_adi ||
              ''
          }

          const unitName = unit?.birim_adi || ''

          let personName = ''
          if (person && (person.ad || person.soyad)) {
            personName = `${person.ad || ''} ${person.soyad || ''}`.trim()
          } else if (person?.email) {
            personName = person.email
          }

          const dateObj = new Date(j.updated_at || j.created_at || 0)
          const rel = formatRelativeTime(dateObj)
          let abs = ''
          if (!Number.isNaN(dateObj.getTime())) {
            const monthsTr = [
              'Ocak',
              'Şubat',
              'Mart',
              'Nisan',
              'Mayıs',
              'Haziran',
              'Temmuz',
              'Ağustos',
              'Eylül',
              'Ekim',
              'Kasım',
              'Aralık',
            ]
            const day = dateObj.getDate()
            const monthName = monthsTr[dateObj.getMonth()] || ''
            const timeStr = dateObj.toLocaleTimeString('tr-TR', {
              hour: '2-digit',
              minute: '2-digit',
            })
            abs = `${day} ${monthName} - ${timeStr}`
          }
          const desc =
            j.aciklama || j.aciklama_metni || j.gorev_aciklamasi || ''

          // Fotoğrafları mümkün olduğunca esnek şekilde çöz
          const extractPhotoUrls = (job) => {
            let raw =
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

            // Zaten array ise direkt dön
            if (Array.isArray(raw)) return raw.filter(Boolean)

            // JSON string ise parse etmeyi dene
            if (typeof raw === 'string') {
              const trimmed = raw.trim()
              try {
                if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                  const parsed = JSON.parse(trimmed)
                  if (Array.isArray(parsed)) {
                    return parsed.filter(Boolean)
                  }
                }
              } catch (e) {
                // JSON değilse virgüle göre böl
              }

              // "url1,url2" formatı
              if (trimmed.includes(',')) {
                return trimmed
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              }

              // Tekil string URL
              return [trimmed]
            }

            return []
          }

          const photoUrls = extractPhotoUrls(j)

          return {
            id: j.id,
            title: j.baslik || 'Görev',
            description: desc,
            company: companyName || '—',
            person: personName || '—',
            timeRelative: rel,
            timeAbsolute: abs,
            unit: unitName || null,
            photos: photoUrls,
          }
        }),
    [jobs, companyById, unitById, staffByCompany, staffById, dateRange],
  )

  const kpiCards = useMemo(() => {
    const v = (n) => (loading ? '−' : n)
    const completedLabel =
      dateFilter === 'today'
        ? 'Tamamlanan Görevler (Bugün)'
        : dateFilter === '7d'
          ? 'Tamamlanan Görevler (Son 7 Gün)'
          : dateFilter === '30d'
            ? 'Tamamlanan Görevler (Son 30 Gün)'
            : dateFilter === 'custom' && dateRange
              ? `Tamamlanan Görevler (${dateRange.start.toLocaleDateString('tr-TR')} – ${dateRange.end.toLocaleDateString('tr-TR')})`
              : 'Tamamlanan Görevler (Tüm Zamanlar)'
    return [
      {
        key: 'pending',
        label: 'Onay Bekleyen Görevler',
        value: v(derivedKpis.pendingApprovals),
        color: '#f59e0b',
        emoji: '⏳',
        buttonLabel: 'Görevlere git',
        onClick: () =>
          navigate(`/admin/tasks?status=${encodeURIComponent(TASK_STATUS.PENDING_APPROVAL)}`),
      },
      {
        key: 'all-tasks',
        label: 'Tüm Görevler',
        value: v(derivedKpis.totalTasks),
        color: '#4f46e5',
        emoji: '🗂️',
        buttonLabel: 'Görevlere git',
        onClick: () => navigate('/admin/tasks'),
      },
      {
        key: 'staff',
        label: 'Aktif Personeller',
        value: v(kpis.activeStaff),
        color: '#06b6d4',
        emoji: '👨‍💼',
        buttonLabel: 'Personellere git',
        onClick: () => navigate('/admin/staff'),
      },
      {
        key: 'completed',
        label: completedLabel,
        value: v(derivedKpis.completed),
        color: '#10b981',
        emoji: '✅',
        buttonLabel: 'Görevlere git',
        onClick: () =>
          navigate(`/admin/tasks?status=${encodeURIComponent(TASK_STATUS.APPROVED)}`),
      },
    ]
  }, [loading, kpis.activeStaff, derivedKpis, dateFilter, dateRange, navigate])

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
        padding: '40px',
        backgroundColor: '#f8fafc',
        minHeight: '100vh',
        position: 'relative',
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <style>{`
        @keyframes announcement-slide-in-right {
          from { opacity: 0; transform: translateX(34px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes announcement-slide-in-left {
          from { opacity: 0; transform: translateX(-34px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          width: 12,
          height: 12,
          backgroundColor: '#22c55e',
          borderRadius: '50%',
          zIndex: 9999,
          boxShadow: '0 0 10px #22c55e',
        }}
      />

      <header
        style={{
          marginBottom: '32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <h1
            style={{
              fontSize: 32,
              fontWeight: 900,
              color: '#020617',
              letterSpacing: '-0.05em',
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
              color: '#64748b',
              fontSize: 14,
            }}
          >
            {companyScoped
              ? 'Yetkili olduğunuz şirket ve birimler için personel, onay ve görev özeti.'
              : 'Şirketler, personeller ve operasyonlar için canlı CEO paneli.'}
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 10,
            maxWidth: 'min(100%, 520px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              justifyContent: 'flex-end',
              alignItems: 'center',
            }}
          >
            <select
              value={dateFilter}
              onChange={(e) => {
                const v = e.target.value
                setDateFilter(v)
                if (v === 'custom') {
                  setCustomRangeStart((prev) => {
                    if (prev) return prev
                    const now = new Date()
                    const start = new Date(
                      now.getFullYear(),
                      now.getMonth(),
                      now.getDate(),
                      0,
                      0,
                      0,
                      0,
                    )
                    start.setDate(start.getDate() - 6)
                    return formatDateInputLocal(start)
                  })
                  setCustomRangeEnd((prev) => {
                    if (prev) return prev
                    return formatDateInputLocal(new Date())
                  })
                }
              }}
              style={{
                fontSize: 12,
                padding: '8px 12px',
                borderRadius: 9999,
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                color: '#111827',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="today">Bugün</option>
              <option value="7d">Son 7 gün</option>
              <option value="30d">Son 30 gün</option>
              <option value="custom">Özel tarih aralığı</option>
              <option value="all">Tüm zamanlar</option>
            </select>
            {dateFilter === 'custom' ? (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 16,
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff',
                }}
              >
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  Başlangıç
                  <input
                    type="date"
                    value={customRangeStart}
                    onChange={(e) => setCustomRangeStart(e.target.value)}
                    style={{
                      fontSize: 12,
                      padding: '6px 8px',
                      borderRadius: 10,
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                    }}
                  />
                </label>
                <span style={{ color: '#94a3b8', fontWeight: 700 }}>—</span>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  Bitiş
                  <input
                    type="date"
                    value={customRangeEnd}
                    onChange={(e) => setCustomRangeEnd(e.target.value)}
                    style={{
                      fontSize: 12,
                      padding: '6px 8px',
                      borderRadius: 10,
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                    }}
                  />
                </label>
              </div>
            ) : null}
          </div>
          {dateFilter === 'custom' ? (
            <p
              style={{
                margin: 0,
                fontSize: 11,
                color: '#64748b',
                textAlign: 'right',
                lineHeight: 1.35,
              }}
            >
              KPI ve görev özetleri; seçilen aralıkta güncellenen / oluşturulan / son tarihi düşen kayıtlara göre
              filtrelenir.
            </p>
          ) : null}
        </div>
      </header>

      {/* Üst KPI şeridi */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 20,
          marginBottom: 32,
        }}
      >
        {kpiCards.map((card) => (
          <div
            key={card.key}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 24,
              border: '1px solid #e2e8f0',
              boxShadow: '0 12px 24px -8px rgba(15,23,42,0.12)',
              display: 'flex',
              padding: 20,
              gap: 16,
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: 6,
                alignSelf: 'stretch',
                borderRadius: 9999,
                backgroundColor: card.color,
              }}
            />
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#64748b',
                }}
              >
                {card.label}
              </span>
              <span
                style={{
                  fontSize: 32,
                  fontWeight: 900,
                  color: '#020617',
                }}
              >
                {card.value}
              </span>
              <button
                type="button"
                onClick={card.onClick}
                style={{
                  marginTop: 8,
                  alignSelf: 'flex-start',
                  borderRadius: 9999,
                  border: `1px solid ${card.color}66`,
                  backgroundColor: `${card.color}14`,
                  color: card.color,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '6px 12px',
                  cursor: 'pointer',
                }}
              >
                {card.buttonLabel}
              </button>
            </div>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 16,
                backgroundColor: `${card.color}20`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
              }}
            >
              {card.emoji}
            </div>
          </div>
        ))}
      </div>

      {/* Canlı İş Akışı */}
      <div
        style={{
          marginBottom: 32,
          backgroundColor: '#ffffff',
          borderRadius: 24,
          border: '1px solid #e2e8f0',
          boxShadow: '0 16px 40px -24px rgba(15,23,42,0.35)',
          padding: 20,
        }}
      >
        <div
          style={{
            marginBottom: 14,
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
              {companyScoped
                ? 'Yetkili birimlerinizde son tamamlanan görevlerin anlık listesi'
                : 'Son yapılan ve güncellenen görevlerin anlık listesi'}
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
            Gösterilen: {liveFlow.length}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 22,
            padding: '4px 4px 18px',
            overflowX: 'auto',
            scrollbarWidth: 'thin',
          }}
        >
          {liveFlow.map((item) => (
            <div
              key={item.id}
              style={{
                minWidth: 320,
                height: 420,
                borderRadius: 12,
                background:
                  'linear-gradient(145deg, #ffffff, #f9fafb)',
                boxShadow: '0 14px 30px -18px rgba(15,23,42,0.65)',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                padding: 16,
              }}
            >
              {/* İş ismi */}
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 900,
                  color: '#111827',
                  letterSpacing: '-0.02em',
                  marginBottom: 6,
                }}
              >
                {item.title}
              </div>

              {/* Operasyon detayı */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  fontSize: 12,
                  color: '#6b7280',
                  marginBottom: 8,
                }}
              >
                {!companyScoped && (
                  <div>
                    <span style={{ marginRight: 4 }}>🏢</span>
                    <span>{item.company}</span>
                  </div>
                )}
                <div>
                  <span style={{ marginRight: 4 }}>👨‍💼</span>
                  <span>{item.person}</span>
                </div>
                {item.unit && (
                  <div>
                    <span style={{ marginRight: 4 }}>🏬</span>
                    <span>{item.unit}</span>
                  </div>
                )}
              </div>

              {/* Zaman */}
              {item.timeAbsolute && (
                <div
                  style={{
                    fontSize: 11,
                    color: '#9ca3af',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    marginBottom: 10,
                  }}
                >
                  <span>🕒</span>
                  <span>{item.timeAbsolute}</span>
                </div>
              )}

              {/* Kanıt fotoğrafları */}
              {item.photos && item.photos.length > 0 ? (
                <div
                  style={{
                    marginBottom: 12,
                    display: 'flex',
                    gap: 8,
                    overflowX: 'auto',
                  }}
                >
                  {item.photos.slice(0, 3).map((url, idx) => (
                    <img
                      key={`${item.id}-${idx}`}
                      src={url}
                      alt="Görev kanıtı"
                      onClick={() => setPreviewPhoto(url)}
                      style={{
                        flexShrink: 0,
                        width: 'calc((320px - 32px) / 3)',
                        height: 180,
                        borderRadius: 16,
                        objectFit: 'cover',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    marginBottom: 10,
                    width: '100%',
                    height: 180,
                    borderRadius: 16,
                    background:
                      'linear-gradient(135deg, #4f46e5, #1d4ed8, #0ea5e9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#e5e7eb',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Kanıt fotoğrafı yok
                </div>
              )}

              {/* Personel notu */}
              {item.description ? (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 13,
                    color: '#4b5563',
                    fontStyle: 'italic',
                    maxHeight: 44,
                    overflow: 'hidden',
                  }}
                >
                  “{item.description}”
                </div>
              ) : null}

              {/* Alt buton */}
              <div
                style={{
                  marginTop: 'auto',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: '#9ca3af',
                  }}
                >
                  {item.timeRelative}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/admin/tasks/${encodeURIComponent(item.id)}`)
                  }
                  style={{
                    marginTop: 10,
                    padding: '8px 14px',
                    borderRadius: 9999,
                    border: '1px solid rgba(79,70,229,0.35)',
                    backgroundColor: 'rgba(79,70,229,0.04)',
                    color: '#4f46e5',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Detay Gör
                </button>
              </div>
            </div>
          ))}

          {!liveFlow.length && !loading && (
            <div
              style={{
                fontSize: 12,
                color: '#9ca3af',
              }}
            >
              Henüz canlı görev akışı bulunmuyor.
            </div>
          )}
        </div>
      </div>

      {/* Orta panel: Şirket özetleri + sağ kolon */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.5fr 1fr',
          gap: 24,
          marginBottom: 32,
        }}
      >
        {/* Şirket Özetleri */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 24,
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 25px -15px rgba(15,23,42,0.25)',
            padding: 22,
          }}
        >
          <div
            style={{
              marginBottom: 18,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#0f172a',
                }}
              >
                {companyScoped ? 'Şirket Özeti' : 'Şirket Özetleri'}
              </h2>
              <p
                style={{
                  fontSize: 12,
                  color: '#6b7280',
                  marginTop: 2,
                }}
              >
                {companyScoped
                  ? 'Şirketinizin seçili dönemdeki performans, ekip ve iş yükü'
                  : 'Tüm ana şirketlerin performans, ekip ve iş yükü görünümü'}
              </p>
            </div>
            <span
              style={{
                fontSize: 12,
                color: '#6b7280',
              }}
            >
              {companyScoped
                ? `Birim: ${units.length}`
                : `Toplam: ${companies.length}`}
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 18,
            }}
          >
            {topCompanySummaries.map((c) => {
              const companyStaff = staffByCompany[c.id] || []
              return (
                <div
                  key={c.id}
                  style={{
                    position: 'relative',
                    borderRadius: 20,
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#ffffff',
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    boxShadow: '0 12px 30px -18px rgba(15,23,42,0.35)',
                    transition:
                      'transform 0.16s ease-out, box-shadow 0.16s ease-out, border-color 0.16s ease-out',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-3px)'
                    e.currentTarget.style.boxShadow =
                      '0 18px 38px -18px rgba(15,23,42,0.45)'
                    e.currentTarget.style.borderColor = '#6366f1'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0px)'
                    e.currentTarget.style.boxShadow =
                      '0 12px 30px -18px rgba(15,23,42,0.35)'
                    e.currentTarget.style.borderColor = '#e5e7eb'
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div
                        style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: '#0f172a',
                          letterSpacing: '-0.02em',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {c.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: '#6b7280',
                        }}
                      >
                        Vergi No: {c.vergiNo}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: '4px 10px',
                        borderRadius: 9999,
                        backgroundColor: '#ecfdf3',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#166534',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 9999,
                          backgroundColor: '#22c55e',
                        }}
                      />
                      %{c.completionRate} Başarı
                    </div>
                  </div>

                  <div
                    style={{
                      position: 'relative',
                      marginTop: 2,
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: 8,
                        borderRadius: 9999,
                        backgroundColor: '#e5e7eb',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${c.completionRate}%`,
                          height: '100%',
                          borderRadius: 9999,
                          background:
                            'linear-gradient(to right, #4f46e5, #6366f1)',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 11,
                      color: '#6b7280',
                    }}
                  >
                    Aktif Personeller
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {companyStaff.length ? (
                      <>
                        {companyStaff.slice(0, 4).map((s) => {
                          const name =
                            s.ad && s.soyad
                              ? `${s.ad} ${s.soyad}`
                              : s.email || ''
                          const initials = name
                            .split(' ')
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((part) => part[0]?.toUpperCase() || '')
                            .join('')
                          return (
                            <div
                              key={s.id}
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 9999,
                                backgroundColor: '#e5e7eb',
                                color: '#111827',
                                fontSize: 11,
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              title={name}
                            >
                              {initials || '?'}
                            </div>
                          )
                        })}
                        {companyStaff.length > 4 && (
                          <span
                            style={{
                              fontSize: 11,
                              color: '#6b7280',
                            }}
                          >
                            +{companyStaff.length - 4}
                          </span>
                        )}
                      </>
                    ) : (
                      <span
                        style={{
                          fontSize: 11,
                          color: '#6b7280',
                        }}
                      >
                        Atanmış personel yok
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      display: 'flex',
                      gap: 8,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/admin/tasks?company=${encodeURIComponent(c.id)}`)
                      }
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        borderRadius: 9999,
                        border: 'none',
                        backgroundColor: '#f97316',
                        color: '#111827',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      İşleri Görüntüle
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/admin/tasks/new?company=${encodeURIComponent(c.id)}`,
                        )
                      }
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        borderRadius: 9999,
                        border: '1px solid #e5e7eb',
                        backgroundColor: '#ffffff',
                        color: '#111827',
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      Görev Ata
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Sağ panel: Acil uyarılar + dinamik akış + analiz */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* Acil Uyarılar */}
          <div
            style={{
              backgroundColor: '#fef2f2',
              borderRadius: 24,
              border: '1px solid #fecaca',
              boxShadow: '0 8px 18px -10px rgba(185,28,28,0.4)',
              padding: 14,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 9999,
                    backgroundColor: '#ef4444',
                    color: '#fef2f2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  !
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#7f1d1d',
                  }}
                >
                  Acil Uyarılar
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: '#b91c1c',
                }}
              >
                Canlı durum
              </span>
            </div>
            <div
              style={{
                fontSize: 12,
                color: '#7f1d1d',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {urgentAlerts.map((item) => (
                <div
                  key={item.key}
                  style={{
                    border: '1px solid #fecaca',
                    borderRadius: 12,
                    backgroundColor: '#fff7f7',
                    padding: '8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{item.title}</strong>
                    <span style={{ fontWeight: 700 }}>{item.count}</span>
                  </div>
                  <span style={{ color: '#991b1b' }}>{item.detail}</span>
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
                      alignSelf: 'flex-start',
                      borderRadius: 9999,
                      border: '1px solid #fca5a5',
                      backgroundColor: '#fff',
                      color: '#991b1b',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '5px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    {item.buttonLabel}
                  </button>
                </div>
              ))}
              {!urgentAlerts.length && <div>Şu anda kritik acil uyarı bulunmuyor.</div>}
            </div>
          </div>

          {/* Duyurular */}
          <div
            style={{
              backgroundColor: '#eef2ff',
              borderRadius: 24,
              border: '1px solid #c7d2fe',
              boxShadow: '0 8px 18px -10px rgba(79,70,229,0.35)',
              padding: 14,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 9999,
                    backgroundColor: '#4f46e5',
                    color: '#eef2ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                  }}
                >
                  🔔
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#1e1b4b',
                  }}
                >
                  Duyurular
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: '#4f46e5',
                }}
              >
                {recentAnnouncements.length
                  ? `${announcementIndex + 1} / ${recentAnnouncements.length}`
                  : 'Yönetici notları'}
              </span>
            </div>
            <div
              style={{
                fontSize: 12,
                color: '#312e81',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {recentAnnouncements.length ? (
                <div
                  style={{
                    position: 'relative',
                    padding: '0 36px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => goToAnnouncement('prev')}
                    disabled={announcementIndex <= 0}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 30,
                      height: 30,
                      borderRadius: 9999,
                      border: '1px solid rgba(99,102,241,0.35)',
                      backgroundColor:
                        announcementIndex <= 0
                          ? 'rgba(238,242,255,0.92)'
                          : 'rgba(255,255,255,0.96)',
                      color: announcementIndex <= 0 ? '#a5b4fc' : '#3730a3',
                      fontWeight: 700,
                      cursor: announcementIndex <= 0 ? 'not-allowed' : 'pointer',
                      boxShadow:
                        announcementIndex <= 0
                          ? 'none'
                          : '0 8px 20px -14px rgba(79,70,229,0.8)',
                      backdropFilter: 'blur(4px)',
                      transition: 'all 0.2s ease',
                      zIndex: 2,
                    }}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => goToAnnouncement('next')}
                    disabled={announcementIndex >= recentAnnouncements.length - 1}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 30,
                      height: 30,
                      borderRadius: 9999,
                      border: '1px solid rgba(99,102,241,0.35)',
                      backgroundColor:
                        announcementIndex >= recentAnnouncements.length - 1
                          ? 'rgba(238,242,255,0.92)'
                          : 'rgba(255,255,255,0.96)',
                      color:
                        announcementIndex >= recentAnnouncements.length - 1
                          ? '#a5b4fc'
                          : '#3730a3',
                      fontWeight: 700,
                      cursor:
                        announcementIndex >= recentAnnouncements.length - 1
                          ? 'not-allowed'
                          : 'pointer',
                      boxShadow:
                        announcementIndex >= recentAnnouncements.length - 1
                          ? 'none'
                          : '0 8px 20px -14px rgba(79,70,229,0.8)',
                      backdropFilter: 'blur(4px)',
                      transition: 'all 0.2s ease',
                      zIndex: 2,
                    }}
                  >
                    →
                  </button>
                  <div
                    key={`${announcementIndex}-${announcementAnimTick}`}
                    style={{
                      border: '1px solid #c7d2fe',
                      borderRadius: 12,
                      backgroundColor: '#f8faff',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      minHeight: 124,
                      boxShadow: '0 10px 24px -16px rgba(79,70,229,0.55)',
                      animation:
                        announcementSlideDir === 'next'
                          ? 'announcement-slide-in-right 260ms ease'
                          : 'announcement-slide-in-left 260ms ease',
                    }}
                  >
                    {companyScoped ? (
                      <div>
                        <strong>
                          {recentAnnouncements[announcementIndex]?.senderName}
                        </strong>{' '}
                        duyurusu:{' '}
                        <span style={{ color: '#4b5563' }}>
                          {recentAnnouncements[announcementIndex]?.text}
                        </span>
                      </div>
                    ) : (
                      <div>
                        <strong>
                          {recentAnnouncements[announcementIndex]?.companyName}
                        </strong>{' '}
                        •{' '}
                        <strong>
                          {recentAnnouncements[announcementIndex]?.senderName}
                        </strong>
                        :{' '}
                        <span style={{ color: '#4b5563' }}>
                          {recentAnnouncements[announcementIndex]?.text}
                        </span>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#6366f1' }}>
                      {recentAnnouncements[announcementIndex]?.timeRelative}
                    </div>
                  </div>
                </div>
              ) : (
                <div>Şu anda duyuru bulunmuyor.</div>
              )}
              <button
                type="button"
                onClick={() => navigate('/admin/announcements')}
                style={{
                  alignSelf: 'flex-start',
                  borderRadius: 9999,
                  border: '1px solid #c7d2fe',
                  backgroundColor: '#ffffff',
                  color: '#3730a3',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '5px 10px',
                  cursor: 'pointer',
                }}
              >
                Duyurulara git
              </button>
            </div>
          </div>

          {/* Son Yapılan İşler */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 24,
              border: '1px solid #e2e8f0',
              boxShadow: '0 10px 20px -10px rgba(15,23,42,0.12)',
              padding: 16,
              maxHeight: 240,
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                marginBottom: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h2
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#111827',
                }}
              >
                Son Yapılan İşler
              </h2>
              <span
                style={{
                  fontSize: 11,
                  color: '#9ca3af',
                }}
              >
                En güncel 15 işlem
              </span>
            </div>
            {activityFeed.length ? (
              activityFeed.map((item) => {
                const statusText = ['tamamlandı', 'tamamlandi'].some((t) =>
                  String(item.status || '').toLowerCase().includes(t),
                )
                  ? 'görevini tamamladı'
                  : 'görevini gönderdi'
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: '6px 2px',
                      borderBottom: '1px solid #f1f5f9',
                      fontSize: 12,
                      color: '#111827',
                    }}
                  >
                    <div>
                      {companyScoped ? (
                        <>
                          <strong>{item.person}</strong>
                          {', '}
                          <span style={{ color: '#4b5563' }}>
                            {item.islem}
                          </span>{' '}
                          {statusText}.
                        </>
                      ) : (
                        <>
                          <strong>{item.company}</strong>
                          {' şirketinde '}
                          <strong>{item.person}</strong>
                          {', '}
                          <span style={{ color: '#4b5563' }}>
                            {item.islem}
                          </span>{' '}
                          {statusText}.
                        </>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#9ca3af',
                        marginTop: 2,
                      }}
                    >
                      {item.timeRelative}
                    </div>
                  </div>
                )
              })
            ) : (
              <div
                style={{
                  fontSize: 12,
                  color: '#9ca3af',
                  paddingTop: 4,
                }}
              >
                Henüz işlem kaydı bulunmuyor.
              </div>
            )}
          </div>

          {/* Operasyon Analizi */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 24,
              border: '1px solid #e2e8f0',
              boxShadow: '0 10px 20px -10px rgba(15,23,42,0.12)',
              padding: 16,
            }}
          >
            <div
              style={{
                marginBottom: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <h2
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#111827',
                  }}
                >
                  {companyScoped ? 'Operasyon Analizi' : 'Sistem Analizi'}
                </h2>
                <span
                  style={{
                    fontSize: 11,
                    color: '#6b7280',
                  }}
                >
                  Tamamlanma, denetim yükü ve risk görünümü
                </span>
              </div>
              {companyScoped ? (
                <span
                  style={{
                    fontSize: 11,
                    padding: '6px 12px',
                    borderRadius: 9999,
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#f9fafb',
                    color: '#374151',
                    fontWeight: 600,
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={scopedCompanyName || ''}
                >
                  {scopedCompanyName || 'Şirketiniz'}
                </span>
              ) : (
                <select
                  value={selectedAnalyticsCompany}
                  onChange={(e) => setSelectedAnalyticsCompany(e.target.value)}
                  style={{
                    fontSize: 11,
                    padding: '6px 10px',
                    borderRadius: 9999,
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#f9fafb',
                    color: '#111827',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="all">Tüm şirketler</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.ana_sirket_adi}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { key: 'rate', label: 'Tamamlanma Oranı', value: `%${analytics.completionRate}`, color: '#10b981' },
                { key: 'waiting', label: 'Onay Bekleyen', value: analytics.waitingApproval, color: '#f59e0b' },
                { key: 'overdue', label: 'Geciken', value: analytics.overdue, color: '#ef4444' },
                { key: 'rejected', label: 'Reddedilen', value: analytics.rejected, color: '#7c3aed' },
              ].map((m) => (
                <div
                  key={m.key}
                  style={{
                    borderRadius: 14,
                    border: `1px solid ${m.color}33`,
                    backgroundColor: `${m.color}10`,
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{m.label}</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>{m.value}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { key: 'total', label: 'Toplam görev', value: analytics.total, color: '#4f46e5' },
                { key: 'completed', label: 'Onaylanan görev', value: analytics.completed, color: '#10b981' },
                { key: 'pending', label: 'Onay bekleyen görev', value: analytics.waitingApproval, color: '#f59e0b' },
              ].map((m) => {
                const maxVal = Math.max(analytics.total, 1)
                const ratio = Math.min(100, Math.round((m.value / maxVal) * 100))
                return (
                  <div key={m.key}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 4,
                        fontSize: 11,
                        color: '#6b7280',
                      }}
                    >
                      <span>{m.label}</span>
                      <span style={{ fontWeight: 700, color: '#111827' }}>{m.value}</span>
                    </div>
                    <div style={{ width: '100%', height: 7, borderRadius: 9999, backgroundColor: '#e5e7eb' }}>
                      <div
                        style={{
                          width: `${ratio}%`,
                          height: '100%',
                          borderRadius: 9999,
                          backgroundColor: m.color,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Fotoğraf önizleme (modal) */}
      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9998,
          }}
        >
          <div
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              borderRadius: 20,
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
              border: '1px solid #1f2937',
              backgroundColor: '#020617',
            }}
          >
            <img
              src={previewPhoto}
              alt="Büyük görev görseli"
              style={{
                display: 'block',
                maxWidth: '90vw',
                maxHeight: '90vh',
                objectFit: 'contain',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminDashboard() {
  const { profile } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const permissions = profile?.yetkiler || {}
  if (!hasManagementDashboardAccess(permissions, isSystemAdmin)) {
    return <TaskOperatorHome />
  }
  return <AdminDashboardKokpit />
}
