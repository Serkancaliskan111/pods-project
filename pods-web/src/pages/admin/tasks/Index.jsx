import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import {
  canApproveTask,
  canAssignTask,
  canRequestTaskDeletion,
  canOperationallyEditAssignedTask,
} from '../../../lib/permissions.js'
import {
  scopeAnaSirketlerQuery,
  scopeBirimlerQuery,
  scopeIslerQuery,
  scopePersonelQuery,
  isUnitInScope,
  TASKS_LIST_LIMIT,
} from '../../../lib/supabaseScope.js'
import {
  TASK_STATUS,
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
  normalizeTaskStatus,
  taskOperationalEditEligible,
} from '../../../lib/taskStatus.js'
import { isTaskVisibleNow, isTaskVisibleToPerson } from '../../../lib/taskVisibility.js'
import { logTaskTimelineEvent } from '../../../lib/taskTimeline.js'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'

const supabase = getSupabase()

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

export default function TasksIndex() {
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
  const companyScoped = !isSystemAdmin && !!currentCompanyId
  const permissions = profile?.yetkiler || {}
  const canCreateTask = isSystemAdmin || canAssignTask(permissions)
  const canSubmitDeletionRequest = canRequestTaskDeletion(permissions)
  const canOpEditTasks =
    isSystemAdmin || canOperationallyEditAssignedTask(permissions, false)
  const [tasks, setTasks] = useState([])
  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [actioningTaskId, setActioningTaskId] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedAlertType, setSelectedAlertType] = useState('')
  const [selectedTaskType, setSelectedTaskType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedUnitIds, setSelectedUnitIds] = useState([])
  const [isUnitMenuOpen, setIsUnitMenuOpen] = useState(false)
  const unitMenuRef = useRef(null)
  const [pendingDeletionByIsId, setPendingDeletionByIsId] = useState({})
  /** Liste personelinde olmayan sorumlu/atayan adları (birim dışı atayan vb.) */
  const [extraStaffLabels, setExtraStaffLabels] = useState({})
  const [confirmCtx, setConfirmCtx] = useState(null)
  const hasHydratedDataRef = useRef(false)
  const tasksCacheKey = useMemo(() => {
    if (!canLoadWithScope) return null
    const companyPart = isSystemAdmin ? 'system' : String(currentCompanyId || 'none')
    const unitPart = isSystemAdmin ? 'all' : JSON.stringify(accessibleUnitIds || [])
    return `web_tasks_index_cache_v1:${companyPart}:${unitPart}`
  }, [canLoadWithScope, isSystemAdmin, currentCompanyId, JSON.stringify(accessibleUnitIds || [])])

  const navigate = useNavigate()
  const location = useLocation()

  const load = async () => {
    if (!canLoadWithScope) return
    if (!hasHydratedDataRef.current) setLoading(true)
    const scope = {
      isSystemAdmin,
      currentCompanyId,
      accessibleUnitIds,
    }
    try {
      const jobsSelectWithVisibleAt =
        'id,baslik,durum,aciklama,baslama_tarihi,son_tarih,created_at,updated_at,gorunur_tarih,ana_sirket_id,birim_id,sorumlu_personel_id,atayan_personel_id,is_sablon_id,gorev_turu,zincir_aktif_adim,ozel_gorev'
      const jobsSelectLegacy =
        'id,baslik,durum,aciklama,baslama_tarihi,son_tarih,created_at,updated_at,ana_sirket_id,birim_id,sorumlu_personel_id,atayan_personel_id,is_sablon_id,gorev_turu,zincir_aktif_adim'
      const [
        { data: comps, error: compErr },
        { data: unitsData, error: unitsErr },
        { data: staffData, error: staffErr },
        jobsRes,
      ] = await Promise.all([
        scopeAnaSirketlerQuery(
          supabase
            .from('ana_sirketler')
            .select('id,ana_sirket_adi')
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
            .select('id,ad,soyad,email,ana_sirket_id,birim_id')
            .is('silindi_at', null),
          scope,
        ),
        scopeIslerQuery(
          supabase
            .from('isler')
            .select(jobsSelectWithVisibleAt)
            .order('created_at', { ascending: false })
            .limit(TASKS_LIST_LIMIT),
          scope,
        ),
      ])
      let { data: jobs, error: jobsErr } = jobsRes
      if (jobsErr?.code === '42703') {
        const legacyRes = await scopeIslerQuery(
          supabase
            .from('isler')
            .select(jobsSelectLegacy)
            .order('created_at', { ascending: false })
            .limit(TASKS_LIST_LIMIT),
          scope,
        )
        jobs = legacyRes.data
        jobsErr = legacyRes.error
      }

      // Ozel gorevde "atayan" gorunurlugu: birim scope disinda kalsa bile atayan kisi kendi ozel gorevini gormeli.
      if (!jobsErr && personel?.id && currentCompanyId) {
        try {
          const { data: privateAssignedByMe, error: privateErr } = await supabase
            .from('isler')
            .select(jobsSelectWithVisibleAt)
            .eq('ana_sirket_id', currentCompanyId)
            .eq('atayan_personel_id', personel.id)
            .eq('ozel_gorev', true)
            .order('created_at', { ascending: false })
            .limit(TASKS_LIST_LIMIT)

          if (!privateErr && Array.isArray(privateAssignedByMe) && privateAssignedByMe.length) {
            const mergedMap = new Map()
            for (const row of jobs || []) mergedMap.set(String(row?.id || ''), row)
            for (const row of privateAssignedByMe) mergedMap.set(String(row?.id || ''), row)
            jobs = Array.from(mergedMap.values())
          }
        } catch (_) {
          // best-effort: ana listeyi bozma
        }
      }

      if (compErr || staffErr || jobsErr || unitsErr) {
        console.error(compErr || staffErr || jobsErr || unitsErr)
        toast.error('Görevler yüklenemedi')
        setTasks([])
        setCompanies(comps || [])
        setStaff(staffData || [])
      } else {
        setCompanies(comps || [])
        setUnits(unitsData || [])
        setStaff(staffData || [])
        const visibleTasks = (jobs || []).filter(
          (t) => isTaskVisibleNow(t) && isTaskVisibleToPerson(t, personel?.id),
        )
        setTasks(visibleTasks)
        if (tasksCacheKey) {
          try {
            window.sessionStorage.setItem(
              tasksCacheKey,
              JSON.stringify({
                companies: comps || [],
                units: unitsData || [],
                staff: staffData || [],
                tasks: visibleTasks,
              }),
            )
          } catch (_) {
            // ignore cache write errors
          }
        }
        hasHydratedDataRef.current = true
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const companyFromQuery = params.get('company')
    const statusFromQuery = params.get('status')
    const alertFromQuery = params.get('alert')
    if (companyScoped && currentCompanyId) {
      setSelectedCompanyId(String(currentCompanyId))
    } else if (companyFromQuery) {
      setSelectedCompanyId(companyFromQuery)
    }

    if (statusFromQuery) {
      const normalized = normalizeTaskStatus(statusFromQuery)
      setSelectedStatus(normalized)
    }
    if (alertFromQuery) {
      setSelectedAlertType(alertFromQuery)
    }
  }, [location.search, companyScoped, currentCompanyId])

  useEffect(() => {
    if (!tasksCacheKey || hasHydratedDataRef.current) return
    try {
      const raw = window.sessionStorage.getItem(tasksCacheKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return
      if (Array.isArray(parsed.companies)) setCompanies(parsed.companies)
      if (Array.isArray(parsed.units)) setUnits(parsed.units)
      if (Array.isArray(parsed.staff)) setStaff(parsed.staff)
      if (Array.isArray(parsed.tasks)) setTasks(parsed.tasks)
      hasHydratedDataRef.current = true
      setLoading(false)
    } catch (_) {
      // ignore cache parse errors
    }
  }, [tasksCacheKey])

  useEffect(() => {
    load()
  }, [
    canLoadWithScope,
    isSystemAdmin,
    currentCompanyId,
    personel?.id,
    JSON.stringify(accessibleUnitIds || []),
  ])

  useEffect(() => {
    if (!tasks.length) {
      setPendingDeletionByIsId({})
      return
    }
    let cancelled = false
    ;(async () => {
      const ids = tasks.map((t) => t.id).filter(Boolean)
      if (!ids.length) return
      const { data, error } = await supabase
        .from('isler_silme_talepleri')
        .select('is_id')
        .eq('durum', 'bekliyor')
        .in('is_id', ids)
      if (cancelled || error) return
      const next = {}
      for (const row of data || []) {
        if (row?.is_id) next[String(row.is_id)] = true
      }
      setPendingDeletionByIsId(next)
    })()
    return () => {
      cancelled = true
    }
  }, [tasks])

  useEffect(() => {
    setExtraStaffLabels({})
  }, [currentCompanyId, isSystemAdmin])

  useEffect(() => {
    if (!canLoadWithScope || !tasks?.length) return
    const staffIds = new Set((staff || []).map((s) => String(s?.id || '').trim()).filter(Boolean))
    const need = new Set()
    for (const t of tasks) {
      const s = t?.sorumlu_personel_id
      const a = t?.atayan_personel_id
      if (s && !staffIds.has(String(s))) need.add(String(s))
      if (a && !staffIds.has(String(a))) need.add(String(a))
    }
    const ids = [...need]
    if (!ids.length) return

    let cancelled = false
    ;(async () => {
      let q = supabase.from('personeller').select('id,ad,soyad,email').in('id', ids)
      if (!isSystemAdmin && currentCompanyId) q = q.eq('ana_sirket_id', currentCompanyId)
      const { data, error } = await q
      if (cancelled) return

      setExtraStaffLabels((prev) => {
        const next = { ...prev }
        let touched = false
        const seen = new Set()
        for (const p of data || []) {
          if (!p?.id) continue
          const k = String(p.id)
          seen.add(k)
          const label =
            (p.ad || p.soyad) ? `${p.ad || ''} ${p.soyad || ''}`.trim() : p.email || `Personel (ref: ${k.slice(0, 8)}…)`
          if (next[k] !== label) {
            next[k] = label
            touched = true
          }
        }
        for (const id of ids) {
          if (seen.has(id)) continue
          const placeholder = `Personel (ref: ${String(id).slice(0, 8)}…)`
          if (next[id] !== placeholder) {
            next[id] = placeholder
            touched = true
          }
        }
        return touched ? next : prev
      })

      if (error && import.meta.env?.DEV) console.warn('tasks index extra staff names', error)
    })()

    return () => {
      cancelled = true
    }
  }, [tasks, staff, canLoadWithScope, currentCompanyId, isSystemAdmin])

  useEffect(() => {
    const onClickOutside = (event) => {
      if (!unitMenuRef.current) return
      if (!unitMenuRef.current.contains(event.target)) {
        setIsUnitMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
    }
  }, [])

  const companyNameById = useMemo(
    () =>
      (companies || []).reduce((acc, c) => {
        acc[String(c.id)] = c?.ana_sirket_adi || '-'
        return acc
      }, {}),
    [companies],
  )

  const unitNameById = useMemo(
    () =>
      (units || []).reduce((acc, u) => {
        acc[String(u.id)] = u?.birim_adi || ''
        return acc
      }, {}),
    [units],
  )

  const staffNameById = useMemo(
    () =>
      (staff || []).reduce((acc, s) => {
        const name =
          s && (s.ad || s.soyad)
            ? `${s.ad || ''} ${s.soyad || ''}`.trim()
            : s?.email || '-'
        acc[String(s.id)] = name
        return acc
      }, {}),
    [staff],
  )

  const getCompanyName = (id) => companyNameById[String(id)] || '-'

  const getUnitName = (id) => unitNameById[String(id)] || ''

  const getStaffName = (id) => {
    if (!id) return '-'
    const k = String(id)
    return staffNameById[k] || extraStaffLabels[k] || '-'
  }

  const getTaskTypeLabel = (taskType) => {
    const value = String(taskType || '').trim()
    if (!value) return '-'
    const labels = {
      normal: 'Normal',
      sablon_gorev: 'Şablon görev',
      zincir_gorev: 'Zincir görev',
      zincir_onay: 'Zincir onay',
      zincir_gorev_ve_onay: 'Zincir görev ve onay',
    }
    if (labels[value]) return labels[value]
    return value
      .replaceAll('_', ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (c) => c.toUpperCase())
  }

  const formatDateTime = (value) => {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const statusOptions = Array.from(
    new Set(tasks.map((t) => normalizeTaskStatus(t?.durum)).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, 'tr'))

  const taskTypeOptions = Array.from(
    new Set([
      'normal',
      'sablon_gorev',
      'zincir_gorev',
      'zincir_onay',
      'zincir_gorev_ve_onay',
      ...tasks.map((t) => String(t?.gorev_turu || '').trim()).filter(Boolean),
    ]),
  ).sort((a, b) => getTaskTypeLabel(a).localeCompare(getTaskTypeLabel(b), 'tr'))

  const availableUnitOptions = units.filter((u) => {
    if (!u?.id) return false
    if (companyScoped) return true
    if (!selectedCompanyId) return true
    return String(u.ana_sirket_id) === String(selectedCompanyId)
  })

  const selectedUnitNames = availableUnitOptions
    .filter((u) => selectedUnitIds.includes(String(u.id)))
    .map((u) => u.birim_adi)

  const toggleUnitSelection = (unitId) => {
    const id = String(unitId)
    setSelectedUnitIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    )
  }

  const preparedTasks = useMemo(
    () =>
      (tasks || []).map((t) => {
        const companyName = getCompanyName(t.ana_sirket_id)
        const staffName = getStaffName(t.sorumlu_personel_id)
        return {
          ...t,
          __searchTitle: String(t.baslik || '').toLowerCase(),
          __searchCompany: String(companyName || '').toLowerCase(),
          __searchStaff: String(staffName || '').toLowerCase(),
        }
      }),
    [tasks, companyNameById, staffNameById],
  )

  const filtered = preparedTasks.filter((t) => {
    const term = search.toLowerCase()
    const titleMatch = t.__searchTitle.includes(term)
    const companyMatch = t.__searchCompany.includes(term)
    const staffMatch = t.__searchStaff.includes(term)
    const matchesSearch = companyScoped
      ? titleMatch || staffMatch
      : titleMatch || companyMatch || staffMatch

    const matchesCompany = companyScoped
      ? String(t.ana_sirket_id) === String(currentCompanyId)
      : selectedCompanyId
        ? String(t.ana_sirket_id) === String(selectedCompanyId)
        : true

    const matchesStatus = selectedStatus
      ? normalizeTaskStatus(t.durum) === selectedStatus
      : true

    const matchesTaskType = selectedTaskType
      ? selectedTaskType === 'sablon_gorev'
        ? !!t.is_sablon_id
        : String(t.gorev_turu || '').trim() === selectedTaskType
      : true

    const matchesUnit = selectedUnitIds.length
      ? selectedUnitIds.includes(String(t.birim_id || ''))
      : true
    const matchesAlert =
      selectedAlertType === 'overdue' ? isOverdueTask(t) : true

    const taskStart = t.baslama_tarihi ? new Date(t.baslama_tarihi) : null
    const taskEnd = t.son_tarih ? new Date(t.son_tarih) : null
    const taskStartMs =
      taskStart && !Number.isNaN(taskStart.getTime()) ? taskStart.getTime() : null
    const taskEndMs =
      taskEnd && !Number.isNaN(taskEnd.getTime()) ? taskEnd.getTime() : null
    const taskRangeStartMs =
      taskStartMs != null && taskEndMs != null
        ? Math.min(taskStartMs, taskEndMs)
        : null
    const taskRangeEndMs =
      taskStartMs != null && taskEndMs != null
        ? Math.max(taskStartMs, taskEndMs)
        : null
    const taskPointTimes = [
      t.baslama_tarihi,
      t.son_tarih,
      t.created_at,
      t.updated_at,
    ]
      .map((value) => {
        if (!value) return null
        const d = new Date(value)
        if (Number.isNaN(d.getTime())) return null
        return d.getTime()
      })
      .filter((value) => value != null)
    const startBoundary = startDate ? new Date(`${startDate}T00:00:00`) : null
    const endBoundary = endDate ? new Date(`${endDate}T23:59:59.999`) : null
    const startBoundaryMs = startBoundary ? startBoundary.getTime() : null
    const endBoundaryMs = endBoundary ? endBoundary.getTime() : null
    const matchesDateRange =
      !startBoundary && !endBoundary
        ? true
        : (() => {
            // Önce görevin başlangıç-bitiş aralığı varsa aralık kesişimini kontrol et
            if (taskRangeStartMs != null && taskRangeEndMs != null) {
              const overlaps =
                (startBoundaryMs == null || taskRangeEndMs >= startBoundaryMs) &&
                (endBoundaryMs == null || taskRangeStartMs <= endBoundaryMs)
              if (overlaps) return true
            }

            // Aralık yoksa/örtüşmediyse görevdeki zaman damgalarından biri aralık içinde mi?
            return taskPointTimes.some((pointMs) => {
              if (startBoundaryMs != null && pointMs < startBoundaryMs) return false
              if (endBoundaryMs != null && pointMs > endBoundaryMs) return false
              return true
            })
          })()

    return (
      matchesSearch &&
      matchesCompany &&
      matchesStatus &&
      matchesTaskType &&
      matchesUnit &&
      matchesAlert &&
      matchesDateRange
    )
  })

  const requestApprove = (task) => {
    if (!task?.id) return
    if (String(task?.sorumlu_personel_id || '') === String(personel?.id || '')) {
      toast.error('Görevi yapan kişi kendi görevini onaylayamaz')
      return
    }
    setConfirmCtx({ type: 'approve', task })
  }

  const executeApprove = async (task) => {
    if (!task?.id) return
    setActioningTaskId(task.id)
    try {
      const { error } = await supabase
        .from('isler')
        .update({ durum: TASK_STATUS.APPROVED })
        .eq('id', task.id)
      if (error) throw error
      await logTaskTimelineEvent(task.id, 'review', personel?.id, 'approve')
      toast.success('Görev onaylandı')
      load()
    } catch (e) {
      console.error(e)
      toast.error('Görev onaylanamadı')
    } finally {
      setActioningTaskId(null)
    }
  }

  const requestReject = (task) => {
    if (!task?.id) return
    setConfirmCtx({ type: 'reject', task })
  }

  const executeReject = async (task, trimmed) => {
    if (!task?.id) return
    setActioningTaskId(task.id)
    try {
      if (
        task.gorev_turu === 'zincir_gorev' ||
        task.gorev_turu === 'zincir_gorev_ve_onay'
      ) {
        const activeStepNo = Number(task.zincir_aktif_adim) || 1
        const { data: currentStep, error: stepErr } = await supabase
          .from('isler_zincir_gorev_adimlari')
          .select('id')
          .eq('is_id', task.id)
          .eq('adim_no', activeStepNo)
          .maybeSingle()
        if (stepErr) throw stepErr
        if (currentStep?.id) {
          const { error: updStepErr } = await supabase
            .from('isler_zincir_gorev_adimlari')
            .update({
              durum: 'reddedildi',
              aciklama: trimmed,
            })
            .eq('id', currentStep.id)
          if (updStepErr) throw updStepErr
        }
      }

      const { error } = await supabase
        .from('isler')
        .update({
          durum: TASK_STATUS.REJECTED,
          red_nedeni: trimmed,
        })
        .eq('id', task.id)
      if (error) {
        // red_nedeni kolonu yoksa fallback
        const { error: fallbackErr } = await supabase
          .from('isler')
          .update({
            durum: TASK_STATUS.REJECTED,
            aciklama: trimmed,
          })
          .eq('id', task.id)
        if (fallbackErr) throw fallbackErr
      }
      await logTaskTimelineEvent(task.id, 'review', personel?.id, `reject:${trimmed}`)
      toast.success('Görev reddedildi')
      load()
    } catch (e) {
      console.error(e)
      toast.error('Görev reddedilemedi')
    } finally {
      setActioningTaskId(null)
    }
  }

  const requestDeletion = (task) => {
    if (!task?.id || !canSubmitDeletionRequest) return
    setConfirmCtx({ type: 'delete', task })
  }

  const executeRequestDeletion = async (task, talepAciklama) => {
    if (!task?.id || !canSubmitDeletionRequest) return
    const aciklama = String(talepAciklama || '').trim()
    if (!aciklama) {
      toast.error('Silme nedeni zorunludur')
      return
    }
    setActioningTaskId(task.id)
    try {
      const { error } = await supabase.rpc('rpc_is_silme_talebi_olustur', {
        p_is_id: task.id,
        p_aciklama: aciklama,
      })
      if (error) throw error
      toast.success('Silme talebi onaya gönderildi')
      setPendingDeletionByIsId((prev) => ({ ...prev, [String(task.id)]: true }))
      await load()
    } catch (e) {
      console.error(e)
      toast.error(e?.message || 'Silme talebi oluşturulamadı')
    } finally {
      setActioningTaskId(null)
    }
  }

  const handleConfirmDialogConfirm = (reason) => {
    if (!confirmCtx?.task) return
    const { type, task } = confirmCtx
    setConfirmCtx(null)
    if (type === 'approve') void executeApprove(task)
    else if (type === 'reject')
      void executeReject(task, String(reason || '').trim())
    else if (type === 'delete')
      void executeRequestDeletion(task, String(reason || '').trim())
  }

  const confirmDialogConfig = useMemo(() => {
    if (!confirmCtx) return null
    if (confirmCtx.type === 'approve') {
      return {
        title: 'Görevi onayla',
        message: 'Bu görevi onaylamak istediğinize emin misiniz?',
        confirmLabel: 'Evet, onayla',
        variant: 'primary',
        reasonInput: false,
      }
    }
    if (confirmCtx.type === 'reject') {
      return {
        title: 'Görevi reddet',
        message:
          'Bu görevi reddetmek istediğinize emin misiniz? Devam etmek için aşağıya red nedenini yazın.',
        confirmLabel: 'Reddet',
        variant: 'danger',
        reasonInput: true,
        reasonRequired: true,
        reasonLabel: 'Red nedeni',
        reasonPlaceholder: 'Red gerekçesini yazın…',
      }
    }
    return {
      title: 'Silme talebi',
      message:
        'Bu iş için silme talebini onaya göndermek üzeresiniz. Onaylayıcı onayından sonra iş kalıcı olarak silinebilir. Devam etmek için silme nedenini yazın.',
      confirmLabel: 'Onaya gönder',
      variant: 'warning',
      reasonInput: true,
      reasonRequired: true,
      reasonLabel: 'Silme nedeni',
      reasonPlaceholder: 'Silme talebinin gerekçesini yazın…',
    }
  }, [confirmCtx])

  const containerStyle = {
    padding: '16px 32px 32px',
    backgroundColor: '#f3f4f6',
    minHeight: 'calc(100vh - 72px)',
  }

  const cardStyle = {
    background: 'linear-gradient(180deg, #ffffff 0%, #fcfdff 100%)',
    borderRadius: '20px',
    padding: '18px 20px',
    marginBottom: '14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    border: '1px solid #dbe4ef',
    boxShadow:
      '0 18px 34px -28px rgba(15,23,42,0.5), 0 1px 0 rgba(255,255,255,0.75) inset',
  }

  const filtersWrapStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: 16,
    marginBottom: 20,
    padding: 18,
    borderRadius: 20,
    background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
    border: '1px solid #dbe5f0',
    boxShadow:
      '0 20px 40px -34px rgba(15,23,42,0.55), 0 1px 0 rgba(255,255,255,0.7) inset',
  }

  const filterFieldStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  }

  const filterLabelStyle = {
    fontSize: 11,
    fontWeight: 800,
    color: '#475569',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    marginLeft: 2,
  }

  const filterControlStyle = {
    width: '100%',
    minHeight: 42,
    borderRadius: 14,
    border: '1px solid #d2dcea',
    padding: '10px 13px',
    fontSize: 12,
    fontWeight: 500,
    color: '#1e293b',
    backgroundColor: '#ffffff',
    outline: 'none',
    boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  }

  const searchControlStyle = {
    ...filterControlStyle,
    gridColumn: '1 / -1',
    minHeight: 44,
    fontSize: 13,
  }

  const unitTriggerStyle = {
    ...filterControlStyle,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    userSelect: 'none',
  }

  const unitMenuStyle = {
    position: 'absolute',
    top: 82,
    left: 0,
    right: 0,
    zIndex: 20,
    maxHeight: 220,
    overflowY: 'auto',
    borderRadius: 14,
    border: '1px solid #d2dcea',
    backgroundColor: '#ffffff',
    boxShadow: '0 22px 35px -22px rgba(15,23,42,0.45)',
    padding: 10,
  }

  const unitOptionStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 10px',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 12,
    color: '#1e293b',
  }

  const unitChipsWrapStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    minHeight: 22,
  }

  const unitChipStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 9px',
    borderRadius: 9999,
    fontSize: 11,
    fontWeight: 700,
    color: '#1d4ed8',
    backgroundColor: '#e0ecff',
    border: '1px solid #b8d3ff',
  }

  const statusBadgeStyle = (durum) => {
    const normalized = normalizeTaskStatus(durum)
    if (normalized === TASK_STATUS.APPROVED) {
      return {
        backgroundColor: '#bbf7d0',
        color: '#166534',
      }
    }
    if (normalized === TASK_STATUS.REJECTED) {
      return {
        backgroundColor: '#fee2e2',
        color: '#b91c1c',
      }
    }
    if (normalized === TASK_STATUS.RESUBMITTED) {
      return {
        backgroundColor: '#e0e7ff',
        color: '#3730a3',
      }
    }
    return {
      backgroundColor: '#e5e7eb',
      color: '#374151',
    }
  }

  return (
    <div style={containerStyle}>
      {/* Başlık + Yeni Görev */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: '#0a1e42',
              letterSpacing: '-0.03em',
            }}
          >
            Görevler
          </h1>
          <p
            style={{
              fontSize: 13,
              color: '#6b7280',
              marginTop: 4,
            }}
          >
            {companyScoped
              ? 'Şirketiniz ve yetkili birimlerinizdeki görevleri görüntüleyin.'
              : 'Tüm şirketlerdeki atanmış görevleri görüntüleyin ve filtreleyin.'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {canCreateTask && (
            <button
              type="button"
              onClick={() => navigate('/admin/tasks/new')}
              style={{
                padding: '10px 20px',
                borderRadius: 12,
                border: 'none',
                backgroundColor: '#0a1e42',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 10px 25px rgba(15,23,42,0.25)',
              }}
            >
              + Yeni Görev Oluştur
            </button>
          )}
        </div>
      </div>

      {/* Filtreler */}
      <div style={filtersWrapStyle}>
        {!companyScoped ? (
          <div style={filterFieldStyle}>
            <label style={filterLabelStyle}>Şirket</label>
            <select
              value={selectedCompanyId}
              onChange={(e) => {
                setSelectedCompanyId(e.target.value)
                setSelectedUnitIds([])
              }}
              style={filterControlStyle}
            >
              <option value="">Tüm şirketler</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ana_sirket_adi}
                </option>
              ))}
            </select>
          </div>
        ) : (
          companies[0] && (
            <div style={filterFieldStyle}>
              <label style={filterLabelStyle}>Şirket</label>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 40,
                  padding: '0 12px',
                  borderRadius: 12,
                  border: '1px solid #dbe2ea',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#0a1e42',
                  backgroundColor: '#eef2ff',
                }}
              >
                {companies[0].ana_sirket_adi}
              </span>
            </div>
          )
        )}
        <div style={filterFieldStyle}>
          <label style={filterLabelStyle}>Görev Durumu</label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={filterControlStyle}
          >
            <option value="">Tüm durumlar</option>
            {statusOptions.map((durum) => (
              <option key={durum} value={durum}>
                {durum}
              </option>
            ))}
          </select>
        </div>
        <div style={filterFieldStyle}>
          <label style={filterLabelStyle}>Görev Tipi</label>
          <select
            value={selectedTaskType}
            onChange={(e) => setSelectedTaskType(e.target.value)}
            style={filterControlStyle}
          >
            <option value="">Tüm görev tipleri</option>
            {taskTypeOptions.map((taskType) => (
              <option key={taskType} value={taskType}>
              {getTaskTypeLabel(taskType)}
              </option>
            ))}
          </select>
        </div>
        <div style={filterFieldStyle}>
          <label style={filterLabelStyle}>Başlangıç Tarihi</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={filterControlStyle}
          />
        </div>
        <div style={filterFieldStyle}>
          <label style={filterLabelStyle}>Bitiş Tarihi</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={filterControlStyle}
          />
        </div>
        <div style={{ ...filterFieldStyle, position: 'relative' }} ref={unitMenuRef}>
          <label style={filterLabelStyle}>Birimler</label>
          <button
            type="button"
            onClick={() => setIsUnitMenuOpen((prev) => !prev)}
            style={unitTriggerStyle}
          >
            <span>
              {selectedUnitIds.length
                ? `${selectedUnitIds.length} birim seçildi`
                : 'Tüm birimler'}
            </span>
            <span style={{ color: '#64748b' }}>{isUnitMenuOpen ? '▲' : '▼'}</span>
          </button>
          {isUnitMenuOpen && (
            <div style={unitMenuStyle}>
              {availableUnitOptions.length ? (
                availableUnitOptions.map((u) => {
                  const checked = selectedUnitIds.includes(String(u.id))
                  return (
                    <label
                      key={u.id}
                      style={{
                        ...unitOptionStyle,
                        backgroundColor: checked ? '#eff6ff' : 'transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleUnitSelection(u.id)}
                        style={{ margin: 0 }}
                      />
                      <span>{u.birim_adi}</span>
                    </label>
                  )
                })
              ) : (
                <div style={{ padding: 8, fontSize: 12, color: '#64748b' }}>
                  Seçilebilir birim bulunamadı.
                </div>
              )}
            </div>
          )}
          <div style={unitChipsWrapStyle}>
            {selectedUnitNames.slice(0, 4).map((name) => (
              <span key={name} style={unitChipStyle}>
                {name}
              </span>
            ))}
            {selectedUnitNames.length > 4 && (
              <span style={unitChipStyle}>+{selectedUnitNames.length - 4}</span>
            )}
          </div>
        </div>
        <div style={{ ...filterFieldStyle, gridColumn: '1 / -1', order: -1 }}>
          <label style={filterLabelStyle}>Arama</label>
          <input
            type="text"
            placeholder={
              companyScoped
                ? 'Görev başlığı veya kişi adına göre ara...'
                : 'Görev başlığı, şirket veya kişi adına göre ara...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={searchControlStyle}
          />
        </div>
      </div>

      {/* Liste */}
      {loading && (
        <div style={{ fontSize: 13, color: '#6b7280' }}>Yükleniyor...</div>
      )}

      {!loading && filtered.length === 0 && (
        <div
          style={{
            fontSize: 13,
            color: '#6b7280',
            padding: '16px 4px',
          }}
        >
          Kayıtlı görev bulunamadı.
        </div>
      )}

      {!loading &&
        filtered.map((t) => {
          const badge = statusBadgeStyle(t.durum)
          const isOverdue = isOverdueTask(t)
          const normalizedStatus = normalizeTaskStatus(t.durum)
          const isApproved = normalizedStatus === TASK_STATUS.APPROVED
          const isRejected = normalizedStatus === TASK_STATUS.REJECTED
          const canManageTask =
            (isSystemAdmin || canApproveTask(permissions)) &&
            (!accessibleUnitIds ||
              !accessibleUnitIds.length ||
              isUnitInScope(accessibleUnitIds, t.birim_id))
          const deleteScopeOk =
            !accessibleUnitIds ||
            !accessibleUnitIds.length ||
            isUnitInScope(accessibleUnitIds, t.birim_id)
          const editScopeOk = deleteScopeOk
          const showDeleteTaskBtn =
            canSubmitDeletionRequest &&
            deleteScopeOk &&
            !pendingDeletionByIsId[String(t.id)]
          const deletionPending = !!pendingDeletionByIsId[String(t.id)]
          const isSelfAssigned = String(t?.sorumlu_personel_id || '') === String(personel?.id || '')
          const approveDisabled = actioningTaskId === t.id || isApproved || isSelfAssigned
          const rejectDisabled =
            actioningTaskId === t.id || isApproved || isRejected
          const assigneeName = getStaffName(t.sorumlu_personel_id)
          const assignerName = t.atayan_personel_id
            ? getStaffName(t.atayan_personel_id)
            : String(t.baslik || '').toLowerCase().includes('ekstra görev girişi') ||
                String(t.baslik || '').toLowerCase().includes('ekstra gorev girisi')
              ? 'Ekstra görev girişi (personel)'
              : '-'
          const shortDescription = String(t.aciklama || '').trim()

          return (
            <div key={t.id} style={cardStyle}>
              {/* Sol: başlık + şirket/personel + tarihler */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  flex: 1,
                }}
              >
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: '#0f172a',
                    letterSpacing: '-0.01em',
                    lineHeight: 1.3,
                  }}
                >
                  {t.baslik || 'Başlıksız görev'}{' '}
                  {t.gorev_turu && t.gorev_turu !== 'normal' ? (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#4f46e5' }}>
                      {t.gorev_turu === 'zincir_gorev' && '🔗'}
                      {t.gorev_turu === 'zincir_onay' && '🔗'}
                      {t.gorev_turu === 'zincir_gorev_ve_onay' && '🔗'}
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#475569',
                    fontWeight: 500,
                  }}
                >
                  {companyScoped ? (
                    <>
                      {getUnitName(t.birim_id)
                        ? `${getUnitName(t.birim_id)} • `
                        : ''}
                      {assigneeName}
                    </>
                  ) : (
                    <>
                      {getCompanyName(t.ana_sirket_id)}
                      {getUnitName(t.birim_id)
                        ? ` • ${getUnitName(t.birim_id)}`
                        : ''}
                      {' • '}
                      {assigneeName}
                    </>
                  )}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 10,
                    marginTop: 8,
                    fontSize: 11.5,
                    color: '#334155',
                    background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
                    border: '1px solid #dbe4ef',
                    borderRadius: 14,
                    padding: '11px 12px',
                  }}
                >
                  <span>
                    <strong>Atanan:</strong> {assigneeName}
                  </span>
                  <span>
                    <strong>Atayan:</strong> {assignerName}
                  </span>
                  <span>
                    <strong>Oluşturma:</strong> {formatDateTime(t.created_at)}
                  </span>
                  <span>
                    <strong>Güncelleme:</strong> {formatDateTime(t.updated_at)}
                  </span>
                  <span>
                    <strong>Bitiş:</strong> {formatDateTime(t.son_tarih)}
                  </span>
                  <span>
                    <strong>Görev tipi:</strong> {getTaskTypeLabel(t.gorev_turu)}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 10,
                    padding: '12px 14px',
                    borderRadius: 14,
                    background: 'linear-gradient(180deg, #f7fbff 0%, #eef6ff 100%)',
                    border: '1px solid #cfe1f8',
                    fontSize: 12,
                    color: '#1f2937',
                    lineHeight: 1.5,
                    boxShadow: '0 8px 18px -18px rgba(15,23,42,0.35)',
                  }}
                >
                  <strong
                    style={{
                      color: '#0f172a',
                      display: 'inline-block',
                      marginRight: 6,
                      fontWeight: 700,
                    }}
                  >
                    Görev açıklaması:
                  </strong>{' '}
                  {shortDescription
                    ? `${shortDescription.slice(0, 160)}${
                        shortDescription.length > 160 ? '…' : ''
                      }`
                    : 'Açıklama girilmemiş.'}
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginTop: 8,
                    fontSize: 11,
                    color: '#6b7280',
                  }}
                >
                  {isOverdue && (
                    <span style={{ color: '#b91c1c', fontWeight: 600 }}>
                      Gecikmiş
                    </span>
                  )}
                </div>
              </div>

              {/* Sağ: durum + detay butonu */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  gap: 10,
                  marginLeft: 18,
                  minWidth: 190,
                  paddingLeft: 14,
                  borderLeft: '1px dashed #cfdceb',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      alignSelf: 'flex-end',
                      padding: '7px 12px',
                      borderRadius: 9999,
                      fontSize: 11.5,
                      fontWeight: 700,
                      backgroundColor: badge.backgroundColor,
                      color: badge.color,
                      border: '1px solid rgba(15,23,42,0.08)',
                    }}
                  >
                    {normalizedStatus || 'Durum yok'}
                  </span>
                  {deletionPending && (
                    <span
                      style={{
                        padding: '6px 11px',
                        borderRadius: 9999,
                        fontSize: 10.5,
                        fontWeight: 700,
                        backgroundColor: '#ffedd5',
                        color: '#9a3412',
                        border: '1px solid #fdba74',
                      }}
                    >
                      Silme için onaya gönderildi
                    </span>
                  )}
                </div>
                {canManageTask && (
                    <>
                      <button
                        type="button"
                        disabled={approveDisabled}
                        onClick={() => requestApprove(t)}
                        title={
                          isApproved
                            ? 'Bu görev zaten onaylandı'
                            : isSelfAssigned
                              ? 'Görevi yapan kişi kendi görevini onaylayamaz'
                            : 'Görevi onayla'
                        }
                        style={{
                          width: 132,
                          padding: '8px 12px',
                          borderRadius: 9999,
                          border: 'none',
                          backgroundColor: '#16a34a',
                          color: '#ffffff',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: approveDisabled ? 'not-allowed' : 'pointer',
                          opacity: approveDisabled ? 0.55 : 1,
                          boxShadow: approveDisabled
                            ? 'none'
                            : '0 10px 20px -16px rgba(22,163,74,0.9)',
                        }}
                      >
                        Onayla
                      </button>
                      <button
                        type="button"
                        disabled={rejectDisabled}
                        onClick={() => requestReject(t)}
                        title={
                          isApproved
                            ? 'Onaylanmış görev reddedilemez'
                            : isRejected
                              ? 'Bu görev zaten reddedildi'
                              : 'Görevi reddet'
                        }
                        style={{
                          width: 132,
                          padding: '8px 12px',
                          borderRadius: 9999,
                          border: 'none',
                          backgroundColor: '#dc2626',
                          color: '#ffffff',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: rejectDisabled ? 'not-allowed' : 'pointer',
                          opacity: rejectDisabled ? 0.55 : 1,
                          boxShadow: rejectDisabled
                            ? 'none'
                            : '0 10px 20px -16px rgba(220,38,38,0.9)',
                        }}
                      >
                        Reddet
                      </button>
                    </>
                  )}
                {canOpEditTasks &&
                  editScopeOk &&
                  taskOperationalEditEligible(t) &&
                  !deletionPending && (
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/tasks/${t.id}/edit`)}
                      title="Görev içeriğini düzenle"
                      style={{
                        width: 132,
                        padding: '8px 12px',
                        borderRadius: 9999,
                        border: '1px solid rgba(59,130,246,0.45)',
                        backgroundColor: 'rgba(59,130,246,0.06)',
                        color: '#1d4ed8',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Düzenle
                    </button>
                  )}
                {showDeleteTaskBtn && (
                  <button
                    type="button"
                    disabled={actioningTaskId === t.id}
                    onClick={() => requestDeletion(t)}
                    title="Silme talebini onaya gönder"
                    style={{
                      width: 132,
                      padding: '8px 12px',
                      borderRadius: 9999,
                      border: 'none',
                      backgroundColor: '#ea580c',
                      color: '#ffffff',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: actioningTaskId === t.id ? 'not-allowed' : 'pointer',
                      opacity: actioningTaskId === t.id ? 0.55 : 1,
                      boxShadow:
                        actioningTaskId === t.id
                          ? 'none'
                          : '0 10px 20px -16px rgba(234,88,12,0.85)',
                    }}
                  >
                    Sil
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => navigate(`/admin/tasks/${t.id}`)}
                  style={{
                    width: 132,
                    padding: '8px 12px',
                    borderRadius: 9999,
                    border: '1px solid rgba(79,70,229,0.4)',
                    backgroundColor: 'rgba(79,70,229,0.04)',
                    color: '#4f46e5',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Detay görüntüle
                </button>
              </div>
            </div>
          )
        })}
      <ConfirmDialog
        key={
          confirmCtx
            ? `${confirmCtx.type}-${confirmCtx.task?.id ?? ''}`
            : 'tasks-confirm-idle'
        }
        open={!!confirmCtx}
        onClose={() => setConfirmCtx(null)}
        {...(confirmDialogConfig || {})}
        cancelLabel="İptal"
        onConfirm={handleConfirmDialogConfirm}
      />
    </div>
  )
}

