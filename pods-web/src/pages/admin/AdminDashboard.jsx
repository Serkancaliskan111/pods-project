import React, { useContext, useEffect, useMemo, useState } from 'react'
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

const supabase = getSupabase()

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

  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin
    ? null
    : personel?.accessibleUnitIds || []
  /** Şirket / birim yöneticisi — platform geneli KPI ve şirket seçicileri gizlenir */
  const companyScoped = !isSystemAdmin && !!currentCompanyId

  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState({
    totalCompanies: 0,
    activeStaff: 0,
    pendingApprovals: 0,
    completedToday: 0,
  })
  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [staff, setStaff] = useState([])
  const [jobs, setJobs] = useState([])
  const [hoveredMetric, setHoveredMetric] = useState(null)
  const [previewPhoto, setPreviewPhoto] = useState(null)
  const [selectedAnalyticsCompany, setSelectedAnalyticsCompany] =
    useState('all')
  const [dateFilter, setDateFilter] = useState('today') // 'today' | '7d' | '30d' | 'all'

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const scope = {
        isSystemAdmin,
        currentCompanyId,
        accessibleUnitIds,
      }
      try {
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
        const todayStartIso = formatTimestampForFilter(todayStart)
        const todayEndIso = formatTimestampForFilter(todayEnd)

        // 1. aşama: hafif sorgular (6 paralel) — bağlantı / pool baskısını azaltır
        const [
          { data: companiesData, error: compErr, count: companyCount },
          { data: unitsData, error: unitsErr },
          { data: staffData, error: staffErr, count: staffCount },
          { count: pendingCount, error: pendingErr },
          { count: cDoneA, error: completedErrA },
          { count: cDoneB, error: completedErrB },
        ] = await Promise.all([
          scopeAnaSirketlerQuery(
            supabase
              .from('ana_sirketler')
              .select('id,ana_sirket_adi,vergi_no', { count: 'exact' })
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
              .select('id,ad,soyad,email,ana_sirket_id,birim_id,durum', {
                count: 'exact',
              })
              .is('silindi_at', null),
            scope,
          ),
          scopeIslerQuery(
            supabase
              .from('isler')
              .select('id', { count: 'exact' })
              .limit(0)
              .in('durum', [TASK_STATUS.PENDING_APPROVAL, TASK_STATUS.RESUBMITTED]),
            scope,
          ),
          scopeIslerQuery(
            supabase
              .from('isler')
              .select('id', { count: 'exact' })
              .limit(0)
              .eq('durum', TASK_STATUS.APPROVED)
              .gte('updated_at', todayStartIso)
              .lte('updated_at', todayEndIso),
            scope,
          ),
          scopeIslerQuery(
            supabase
              .from('isler')
              .select('id', { count: 'exact' })
              .limit(0)
              .eq('durum', TASK_STATUS.APPROVED)
              .gte('updated_at', todayStartIso)
              .lte('updated_at', todayEndIso),
            scope,
          ),
        ])

        const completedErr = completedErrA || completedErrB
        const completedTodayCount = Math.max(cDoneA || 0, cDoneB || 0)

        if (compErr || staffErr || unitsErr || pendingErr || completedErr) {
          console.error(
            compErr ||
              staffErr ||
              unitsErr ||
              pendingErr ||
              completedErr,
          )
          setLoading(false)
          return
        }

        // 2. aşama: ağır görev listesi — üst sınır + sıralama (tüm tabloyu çekme)
        let jobsQ = scopeIslerQuery(
          supabase
            .from('isler')
            .select(
              'id,baslik,durum,aciklama,updated_at,created_at,son_tarih,ana_sirket_id,birim_id,sorumlu_personel_id,kanit_resim_ler,checklist_cevaplari,gorev_turu,acil',
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
          const { data: chainSteps } = await supabase
            .from('isler_zincir_gorev_adimlari')
            .select('is_id,adim_no,updated_at,kanit_resim_ler,kanit_foto_durumlari')
            .in('is_id', chainJobIds)
            .order('adim_no', { ascending: false })
            .order('updated_at', { ascending: false })

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

        setCompanies(companiesData || [])
        setUnits(unitsData || [])
        setStaff(staffData || [])
        setJobs(jobsWithFallbackPhotos)

        const activeStaffCount = (staffData || []).filter(
          (s) => s.durum === true,
        ).length

        setKpis({
          totalCompanies: companyCount || 0,
          activeStaff: activeStaffCount,
          pendingApprovals: pendingCount || 0,
          completedToday: completedTodayCount || 0,
        })
      } catch (e) {
        console.error('AdminDashboard load error', e)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [
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
    return null
  }, [dateFilter])

  const isInDateRange = (rawDate) => {
    if (!dateRange) return true
    if (!rawDate) return false
    const d = new Date(rawDate)
    if (Number.isNaN(d.getTime())) return false
    return d >= dateRange.start && d <= dateRange.end
  }

  const jobsByCompany = useMemo(
    () =>
      jobs.reduce((acc, j) => {
        if (!j.ana_sirket_id) return acc
        if (!isInDateRange(j.updated_at || j.created_at || j.son_tarih)) {
          return acc
        }
        const key = j.ana_sirket_id
        if (!acc[key]) acc[key] = []
        acc[key].push(j)
        return acc
      }, {}),
    [jobs, dateRange],
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
  }, [companies, jobsByCompany, jobs])

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
    const baseJobsAll = jobs.filter((j) =>
      isInDateRange(j.updated_at || j.created_at || j.son_tarih),
    )

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
    return { total, completed, waitingApproval, overdue }
  }, [jobs, selectedAnalyticsCompany, dateRange])

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
    return [
      companyScoped
        ? {
            key: 'units',
            label: 'Yetkili Birim',
            value: v(units.length),
            color: '#4f46e5',
            emoji: '🏬',
          }
        : {
            key: 'companies',
            label: 'Toplam Şirket',
            value: v(kpis.totalCompanies),
            color: '#4f46e5',
            emoji: '🏢',
          },
      {
        key: 'staff',
        label: 'Aktif Personel',
        value: v(kpis.activeStaff),
        color: '#06b6d4',
        emoji: '👨‍💼',
      },
      {
        key: 'pending',
        label: 'Bekleyen Onaylar',
        value: v(kpis.pendingApprovals),
        color: '#f59e0b',
        emoji: '⏳',
      },
      {
        key: 'doneToday',
        label: 'Günlük Tamamlanan',
        value: v(kpis.completedToday),
        color: '#10b981',
        emoji: '✅',
      },
    ]
  }, [companyScoped, loading, units.length, kpis])

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
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
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
          <option value="all">Tüm zamanlar</option>
        </select>
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
                gap: 4,
              }}
            >
              {analytics.overdue > 0 && (
                <div>
                  {analytics.overdue} adet{' '}
                  <strong>geciken görev</strong> bulunuyor. Önceliklendirilmesi
                  önerilir.
                </div>
              )}
              {analytics.waitingApproval > 0 && (
                <div>
                  {analytics.waitingApproval} adet{' '}
                  <strong>onay bekleyen görev</strong> bulunuyor. Yönetici
                  onayı bekleniyor.
                </div>
              )}
              {analytics.overdue === 0 && analytics.waitingApproval === 0 && (
                <div>Şu anda kritik acil uyarı bulunmuyor.</div>
              )}
            </div>
          </div>

          {/* Duyurular (Acil Görevler) */}
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
                Yönetici notları
              </span>
            </div>
            <div
              style={{
                fontSize: 12,
                color: '#312e81',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {jobs
                .filter(
                  (j) =>
                    j.acil === true &&
                    isInDateRange(j.updated_at || j.created_at || j.son_tarih),
                )
                .slice()
                .sort((a, b) => {
                  const da = new Date(a.updated_at || a.created_at || 0).getTime()
                  const db = new Date(b.updated_at || b.created_at || 0).getTime()
                  return db - da
                })
                .slice(0, 5)
                .map((j) => {
                  const company = companyById[j.ana_sirket_id]
                  const person =
                    (j.sorumlu_personel_id &&
                      staffById[j.sorumlu_personel_id]) ||
                    null
                  const companyName =
                    company?.ana_sirket_adi || 'Bilinmeyen Şirket'
                  const personName =
                    person && (person.ad || person.soyad)
                      ? `${person.ad || ''} ${person.soyad || ''}`.trim()
                      : person?.email || 'Bilinmeyen Personel'
                  const rel = formatRelativeTime(
                    j.updated_at || j.created_at,
                  )
                  return (
                    <div key={j.id}>
                      {companyScoped ? (
                        <>
                          <strong>{personName}</strong> için{' '}
                          <span style={{ color: '#4b5563' }}>
                            {j.baslik || 'Acil görev'}
                          </span>{' '}
                          atanmış.
                        </>
                      ) : (
                        <>
                          <strong>{companyName}</strong> şirketinde{' '}
                          <strong>{personName}</strong> için{' '}
                          <span style={{ color: '#4b5563' }}>
                            {j.baslik || 'Acil görev'}
                          </span>{' '}
                          atanmış.
                        </>
                      )}
                      <div
                        style={{
                          fontSize: 11,
                          color: '#6366f1',
                        }}
                      >
                        {rel}
                      </div>
                    </div>
                  )
                })}
              {!jobs.some(
                (j) =>
                  j.acil === true &&
                  isInDateRange(j.updated_at || j.created_at || j.son_tarih),
              ) && <div>Şu anda acil duyuru bulunmuyor.</div>}
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

          {/* Sistem Analizi Grafiği */}
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
                    color: '#9ca3af',
                  }}
                >
                  Yapılan / Onaylanan / Geciken
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
            <div
              style={{
                height: 160,
                display: 'flex',
                alignItems: 'flex-end',
                gap: 16,
                paddingBottom: 4,
              }}
            >
              {[
                {
                  key: 'total',
                  label: 'Yapılan İş',
                  value: analytics.total,
                  color: '#4f46e5',
                },
                {
                  key: 'completed',
                  label: 'Onaylanan İş',
                  value: analytics.completed,
                  color: '#10b981',
                },
                {
                  key: 'overdue',
                  label: 'Geciken İş',
                  value: analytics.overdue,
                  color: '#f97373',
                },
              ].map((m) => {
                const maxVal =
                  Math.max(
                    analytics.total,
                    analytics.completed,
                    analytics.overdue,
                  ) || 1
                const ratio = m.value / maxVal
                const h = 30 + ratio * 100
                const isHover = hoveredMetric === m.key
                return (
                  <div
                    key={m.key}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={() => setHoveredMetric(m.key)}
                    onMouseLeave={() => setHoveredMetric(null)}
                  >
                    <div
                      style={{
                        width: 22,
                        borderRadius: 9999,
                        backgroundColor: '#e5e7eb',
                        overflow: 'hidden',
                        display: 'flex',
                        justifyContent: 'center',
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: h,
                          borderRadius: 9999,
                          backgroundColor: m.color,
                          boxShadow: isHover
                            ? '0 12px 30px rgba(15,23,42,0.35)'
                            : 'none',
                          transition:
                            'height 0.2s ease, box-shadow 0.2s ease',
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        color: '#6b7280',
                        textAlign: 'center',
                      }}
                    >
                      {m.label}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: '#111827',
                        fontWeight: 600,
                      }}
                    >
                      {m.value}
                    </span>
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
