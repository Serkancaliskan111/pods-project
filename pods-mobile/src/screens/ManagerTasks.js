import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  FlatList,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import Theme from '../theme/theme'
import { hasCompanyTasksTabAccess, isTopCompanyScope } from '../lib/managementScope'
import {
  enrichScopeWithJunctionPersonelIds,
  scopeAnaSirketlerQuery,
  scopeBirimlerQuery,
  scopeIslerQuery,
  scopePersonelQuery,
  isUnitInScope,
  TASKS_LIST_LIMIT,
} from '../lib/supabaseScope'
import { taskMatchesManagerTasksListScope } from '../lib/managerTasksListScope'
import {
  TASK_STATUS,
  normalizeTaskStatus,
  isPendingApprovalTaskStatus,
  taskOperationalEditEligible,
} from '../lib/taskStatus'
import { getTaskVisibleAt } from '../lib/taskVisibility'
import { canApproveTaskDeletion, canRequestTaskDeletion } from '../lib/taskDeletion'
import { canApproveTask, canOperationallyEditAssignedTask } from '../lib/taskPermissions'
import { logTaskTimelineEvent } from '../lib/taskTimeline'
import { GOREV_TURU, isSiraliGorevTuru } from '../lib/zincirTasks'

const supabase = getSupabase()
const ThemeObj = Theme?.default ?? Theme
const { Colors, Typography, Radii, Spacing } = ThemeObj

const TASK_TYPE_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'zincir_gorev', label: 'Zincir görev' },
  { value: 'zincir_onay', label: 'Zincir onay' },
  { value: 'zincir_gorev_ve_onay', label: 'Zincir görev + onay' },
  { value: 'sirali_gorev', label: 'Sıralı görev' },
]

const STATUS_OPTIONS = [
  TASK_STATUS.ASSIGNED,
  TASK_STATUS.PENDING_APPROVAL,
  TASK_STATUS.APPROVED,
  TASK_STATUS.RESUBMITTED,
  TASK_STATUS.REJECTED,
  '__OVERDUE__',
]

function statusOptionLabel(status) {
  return status === '__OVERDUE__' ? 'Gecikmiş' : status
}

function getTaskTypeLabel(value) {
  const found = TASK_TYPE_OPTIONS.find((x) => x.value === String(value || 'normal'))
  return found?.label || 'Normal'
}

function getStatusPillStyle(status) {
  const normalized = normalizeTaskStatus(status)
  if (normalized === TASK_STATUS.APPROVED) {
    return { backgroundColor: '#dcfce7', borderColor: '#86efac', textColor: '#166534' }
  }
  if (normalized === TASK_STATUS.ASSIGNED) {
    return { backgroundColor: '#dbeafe', borderColor: '#93c5fd', textColor: '#1d4ed8' }
  }
  if (normalized === TASK_STATUS.REJECTED) {
    return { backgroundColor: '#fee2e2', borderColor: '#fca5a5', textColor: '#991b1b' }
  }
  if (normalized === TASK_STATUS.PENDING_APPROVAL || normalized === TASK_STATUS.RESUBMITTED) {
    return { backgroundColor: '#fef3c7', borderColor: '#fcd34d', textColor: '#92400e' }
  }
  return { backgroundColor: Colors.alpha.indigo10, borderColor: Colors.alpha.indigo15, textColor: Colors.primary }
}

const TASK_DATE_PRESET_ALL = 'all'
const TASK_DATE_PRESET_TODAY = 'today'
const TASK_DATE_PRESET_WEEK = 'week'
const TASK_DATE_PRESET_MONTH = 'month'
const TASK_DATE_PRESET_3MONTHS = '3months'
const TASK_DATE_PRESET_CUSTOM = 'custom'

function getDayRange(date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const endExclusive = new Date(start)
  endExclusive.setDate(endExclusive.getDate() + 1)
  return { startIso: start.toISOString(), endIsoExclusive: endExclusive.toISOString() }
}

function getTodayRange() {
  return getDayRange(new Date())
}

function getLastDaysRange(days) {
  const end = new Date()
  const endRange = getDayRange(end)
  const start = new Date(endRange.startIso)
  start.setDate(start.getDate() - (days - 1))
  start.setHours(0, 0, 0, 0)
  return { startIso: start.toISOString(), endIsoExclusive: endRange.endIsoExclusive }
}

function taskAnchorInDateRange(task, range) {
  if (!range) return true
  const at = getTaskVisibleAt(task)
  if (!at) return true
  const s = String(at)
  return s >= range.startIso && s < range.endIsoExclusive
}

function dedupeTasksById(rows) {
  const map = new Map()
  for (const row of rows || []) {
    const id = String(row?.id || '').trim()
    if (!id) continue
    map.set(id, row)
  }
  return Array.from(map.values())
}

export default function ManagerTasks() {
  const navigation = useNavigation()
  const route = useRoute()
  const { personel, permissions, profile } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState([])
  /** Sıralı görev: iş UUID → adım satırları (liste genişletmesi) */
  const [siraliStepsByTaskId, setSiraliStepsByTaskId] = useState({})
  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [staff, setStaff] = useState([])
  const [showFilters, setShowFilters] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [taskDatePreset, setTaskDatePreset] = useState(TASK_DATE_PRESET_ALL)
  const [taskDateCustomStart, setTaskDateCustomStart] = useState(null)
  const [taskDateCustomEnd, setTaskDateCustomEnd] = useState(null)
  const [taskDatePickerField, setTaskDatePickerField] = useState(null)
  const [selectedType, setSelectedType] = useState('')
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedUnitIds, setSelectedUnitIds] = useState([])
  const [pendingDeletionByIsId, setPendingDeletionByIsId] = useState({})
  /** Birim filtreli personel listesinde olmayan sorumlu/atayan adları */
  const [extraStaffLabels, setExtraStaffLabels] = useState({})
  const [actionModal, setActionModal] = useState(null)
  const [reasonDraft, setReasonDraft] = useState('')
  const [busyTaskId, setBusyTaskId] = useState(null)
  const lastOverdueFilterRequestRef = useRef(null)

  const taskDateRange = useMemo(() => {
    if (taskDatePreset === TASK_DATE_PRESET_ALL) return null
    if (taskDatePreset === TASK_DATE_PRESET_TODAY) return getTodayRange()
    if (taskDatePreset === TASK_DATE_PRESET_WEEK) return getLastDaysRange(7)
    if (taskDatePreset === TASK_DATE_PRESET_MONTH) return getLastDaysRange(30)
    if (taskDatePreset === TASK_DATE_PRESET_3MONTHS) return getLastDaysRange(90)
    if (taskDatePreset === TASK_DATE_PRESET_CUSTOM) {
      if (!taskDateCustomStart || !taskDateCustomEnd) return null
      const start = new Date(taskDateCustomStart)
      const end = new Date(taskDateCustomEnd)
      if (end < start) {
        const tmpMs = start.getTime()
        start.setTime(end.getTime())
        end.setTime(tmpMs)
      }
      const { startIso, endIsoExclusive } = getDayRange(start)
      const endDay = getDayRange(end).endIsoExclusive
      return { startIso, endIsoExclusive: endDay }
    }
    return null
  }, [taskDatePreset, taskDateCustomStart, taskDateCustomEnd])

  const onTaskDateAndroidChange = useCallback((event, selected) => {
    if (event?.type === 'dismissed') {
      setTaskDatePickerField(null)
      return
    }
    if (!selected || !taskDatePickerField) return
    if (taskDatePickerField === 'start') setTaskDateCustomStart(selected)
    else setTaskDateCustomEnd(selected)
    setTaskDatePickerField(null)
  }, [taskDatePickerField])

  const canUseScreen = hasCompanyTasksTabAccess(permissions, personel)
  const canDeletionApprove = canApproveTaskDeletion(permissions)
  const canSubmitDeletion = canRequestTaskDeletion(permissions)
  const canOpEdit = isSystemAdmin || canOperationallyEditAssignedTask(permissions, false)
  const topScope = isTopCompanyScope(personel, permissions)
  /** Çoklu şirket adı / filtresi yalnızca sistem yöneticisi (şirket yöneticisi başka şirketleri görmez). */
  const showCompanyFilter = isSystemAdmin
  const currentCompanyId = personel?.ana_sirket_id
  const accessibleUnitIds = Array.isArray(personel?.accessibleUnitIds) ? personel.accessibleUnitIds : []

  const load = useCallback(async () => {
    if (!canUseScreen || !currentCompanyId) {
      setTasks([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const taskSelectWithVisible =
        'id,baslik,durum,aciklama,baslama_tarihi,son_tarih,created_at,updated_at,gorunur_tarih,ana_sirket_id,birim_id,sorumlu_personel_id,atayan_personel_id,gorev_turu,ozel_gorev,zincir_aktif_adim,tekrar_gonderim_sayisi'
      const taskSelectLegacy =
        'id,baslik,durum,aciklama,baslama_tarihi,son_tarih,created_at,updated_at,ana_sirket_id,birim_id,sorumlu_personel_id,atayan_personel_id,gorev_turu'
      const scope = await enrichScopeWithJunctionPersonelIds(supabase, {
        isSystemAdmin,
        currentCompanyId,
        accessibleUnitIds,
      })
      let tasksPromise = scopeIslerQuery(
        supabase
          .from('isler')
          .select(taskSelectWithVisible)
          .order('created_at', { ascending: false })
          .limit(TASKS_LIST_LIMIT),
        scope,
      )

      const [companiesRes, unitsRes, staffRes, tasksRes] = await Promise.all([
        scopeAnaSirketlerQuery(
          supabase.from('ana_sirketler').select('id,ana_sirket_adi').is('silindi_at', null),
          scope,
        ),
        scopeBirimlerQuery(
          supabase.from('birimler').select('id,birim_adi,ana_sirket_id').is('silindi_at', null),
          scope,
        ),
        scopePersonelQuery(
          supabase.from('personeller').select('id,ad,soyad,email,ana_sirket_id,birim_id').is('silindi_at', null),
          scope,
        ),
        tasksPromise,
      ])
      let tasksData = tasksRes?.data || []
      let tasksErr = tasksRes?.error
      if (tasksErr?.code === '42703') {
        const legacyRes = await scopeIslerQuery(
          supabase
            .from('isler')
            .select(taskSelectLegacy)
            .order('created_at', { ascending: false })
            .limit(TASKS_LIST_LIMIT),
          scope,
        )
        tasksData = legacyRes?.data || []
        tasksErr = legacyRes?.error
      }

      // Özel görev: atayan, birim kapsamı dışında kalsa bile kendi oluşturduklarını görsün (sunucu .in(birim) ile düşmesin).
      if (!tasksErr && !isSystemAdmin && personel?.id && currentCompanyId) {
        try {
          let privQ = supabase
            .from('isler')
            .select(taskSelectWithVisible)
            .eq('ana_sirket_id', currentCompanyId)
            .eq('atayan_personel_id', personel.id)
            .eq('ozel_gorev', true)
            .order('created_at', { ascending: false })
            .limit(TASKS_LIST_LIMIT)
          const { data: privRows, error: privErr } = await privQ
          if (!privErr && Array.isArray(privRows) && privRows.length) {
            const merged = new Map()
            for (const row of tasksData || []) merged.set(String(row?.id || ''), row)
            for (const row of privRows) merged.set(String(row?.id || ''), row)
            tasksData = Array.from(merged.values())
          }
        } catch (_) {
          /* ana listeyi koru */
        }
      }

      const allCompanies = companiesRes?.data || []
      const allUnits = unitsRes?.data || []
      const allStaff = staffRes?.data || []
      let allTasks = tasksData || []

      // Hiyerarşi kapsamındaki personellerin görevleri, bazı legacy kayıtlarda birim_id eşleşmese de görünmeli.
      if (!tasksErr && !isSystemAdmin && currentCompanyId && Array.isArray(allStaff) && allStaff.length) {
        const scopedPersonelIds = allStaff.map((p) => p?.id).filter(Boolean)
        if (scopedPersonelIds.length) {
          let fromPersonScope = []
          const chunkSize = 300
          for (let i = 0; i < scopedPersonelIds.length; i += chunkSize) {
            const chunk = scopedPersonelIds.slice(i, i + chunkSize)
            let scopedRes = await supabase
              .from('isler')
              .select(taskSelectWithVisible)
              .eq('ana_sirket_id', currentCompanyId)
              .in('sorumlu_personel_id', chunk)
              .order('created_at', { ascending: false })
              .limit(TASKS_LIST_LIMIT)
            if (scopedRes?.error?.code === '42703') {
              scopedRes = await supabase
                .from('isler')
                .select(taskSelectLegacy)
                .eq('ana_sirket_id', currentCompanyId)
                .in('sorumlu_personel_id', chunk)
                .order('created_at', { ascending: false })
                .limit(TASKS_LIST_LIMIT)
            }
            if (!scopedRes?.error && Array.isArray(scopedRes?.data) && scopedRes.data.length) {
              fromPersonScope = fromPersonScope.concat(scopedRes.data)
            }
          }
          if (fromPersonScope.length) {
            allTasks = dedupeTasksById([...allTasks, ...fromPersonScope])
          }
        }
      }

      const listScopeCtx = {
        personel,
        isSystemAdmin,
        currentCompanyId,
        topScope,
        accessibleUnitIds,
      }
      const scopedTasks = allTasks.filter((t) => taskMatchesManagerTasksListScope(t, listScopeCtx))

      setCompanies(allCompanies)
      setUnits(allUnits)
      setStaff(allStaff)
      setTasks(scopedTasks)

      const taskIds = scopedTasks.map((t) => t.id).filter(Boolean)
      let pendingMap = {}
      if (taskIds.length) {
        const chunkSize = 400
        for (let i = 0; i < taskIds.length; i += chunkSize) {
          const chunk = taskIds.slice(i, i + chunkSize)
          const { data: pendRows } = await supabase
            .from('isler_silme_talepleri')
            .select('is_id')
            .eq('durum', 'bekliyor')
            .in('is_id', chunk)
          for (const row of pendRows || []) {
            if (row?.is_id) pendingMap[String(row.is_id)] = true
          }
        }
      }
      setPendingDeletionByIsId(pendingMap)

      if (!showCompanyFilter) setSelectedCompanyId(String(currentCompanyId))
    } catch (_) {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [
    canUseScreen,
    currentCompanyId,
    accessibleUnitIds,
    topScope,
    personel?.id,
    isSystemAdmin,
    showCompanyFilter,
  ])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  React.useEffect(() => {
    setExtraStaffLabels({})
  }, [currentCompanyId, isSystemAdmin])

  React.useEffect(() => {
    let cancelled = false
    const ids = (tasks || [])
      .filter((t) => isSiraliGorevTuru(t?.gorev_turu))
      .map((t) => t.id)
      .filter(Boolean)
    if (!ids.length) {
      setSiraliStepsByTaskId({})
      return undefined
    }
    ;(async () => {
      const { data, error } = await supabase
        .from('isler_zincir_gorev_adimlari')
        .select('id, is_id, adim_no, personel_id, denetimci_personel_id, adim_baslik, adim_durum, durum')
        .in('is_id', ids)
        .order('adim_no', { ascending: true })
      if (cancelled) return
      if (error) {
        setSiraliStepsByTaskId({})
        return
      }
      const by = {}
      for (const row of data || []) {
        const k = String(row.is_id)
        if (!by[k]) by[k] = []
        by[k].push(row)
      }
      setSiraliStepsByTaskId(by)
    })()
    return () => {
      cancelled = true
    }
  }, [tasks])

  React.useEffect(() => {
    if (!tasks?.length || !currentCompanyId) return
    const staffIds = new Set((staff || []).map((s) => String(s?.id || '').trim()).filter(Boolean))
    const need = new Set()
    for (const t of tasks) {
      const s = t?.sorumlu_personel_id
      const a = t?.atayan_personel_id
      if (s && !staffIds.has(String(s))) need.add(String(s))
      if (a && !staffIds.has(String(a))) need.add(String(a))
    }
    for (const rows of Object.values(siraliStepsByTaskId || {})) {
      for (const step of rows || []) {
        const w = step?.personel_id
        const d = step?.denetimci_personel_id
        if (w && !staffIds.has(String(w))) need.add(String(w))
        if (d && !staffIds.has(String(d))) need.add(String(d))
      }
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

      if (error && __DEV__) console.warn('[ManagerTasks] extra staff names', error.message || error)
    })()

    return () => {
      cancelled = true
    }
  }, [tasks, staff, currentCompanyId, isSystemAdmin, siraliStepsByTaskId])

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 120)
    return () => clearTimeout(t)
  }, [search])

  const getStaffName = useCallback(
    (id) => {
      if (!id) return '-'
      const k = String(id)
      const p = staff.find((x) => String(x.id) === k)
      if (p) return `${p.ad || ''} ${p.soyad || ''}`.trim() || p.email || '-'
      return extraStaffLabels[k] || '-'
    },
    [staff, extraStaffLabels],
  )

  const getUnitName = useCallback((id) => units.find((u) => String(u.id) === String(id))?.birim_adi || '-', [units])

  const staffNameMap = useMemo(() => {
    const map = { ...extraStaffLabels }
    for (const p of staff || []) {
      map[String(p.id)] = `${p.ad || ''} ${p.soyad || ''}`.trim() || p.email || '-'
    }
    return map
  }, [staff, extraStaffLabels])

  const unitNameMap = useMemo(() => {
    const map = {}
    for (const u of units || []) {
      map[String(u.id)] = u.birim_adi || '-'
    }
    return map
  }, [units])

  const preparedTasks = useMemo(() => {
    const out = []
    for (const t of tasks || []) {
      const assigneeName = staffNameMap[String(t?.sorumlu_personel_id || '')] || '-'
      const assignerName = t?.atayan_personel_id
        ? staffNameMap[String(t.atayan_personel_id)] || '-'
        : 'Kayıtta yok (eski kayıt)'
      const unitName = unitNameMap[String(t?.birim_id || '')] || '-'
      const taskType = getTaskTypeLabel(t?.gorev_turu)
      const baseSearch =
        `${String(t?.baslik || '')} ${String(t?.aciklama || '')} ${assigneeName} ${assignerName}`.toLowerCase()
      const base = {
        ...t,
        _assigneeName: assigneeName,
        _assignerName: assignerName,
        _unitName: unitName,
        _taskTypeLabel: taskType,
        _searchText: baseSearch,
      }

      if (!isSiraliGorevTuru(t?.gorev_turu)) {
        out.push({ ...base, _listRowKey: String(t.id) })
        continue
      }

      const steps = siraliStepsByTaskId[String(t.id)]
      if (!Array.isArray(steps) || !steps.length) {
        out.push({ ...base, _listRowKey: String(t.id) })
        continue
      }

      const sorted = [...steps].sort((a, b) => Number(a?.adim_no || 0) - Number(b?.adim_no || 0))
      const total = sorted.length
      const title = String(t?.baslik || 'Görev')
      for (const step of sorted) {
        const workerId = step?.personel_id
        const auditorId = step?.denetimci_personel_id
        const workerName = staffNameMap[String(workerId)] || '-'
        const auditorName = auditorId ? staffNameMap[String(auditorId)] || '-' : ''
        const stepBaslik = String(step?.adim_baslik || '').trim() || `Adım ${step.adim_no}`
        const stepDurum = String(step?.adim_durum || step?.durum || '')
        const assigneeLine = auditorName ? `${workerName} · Denetim: ${auditorName}` : workerName
        const displayBaslik = `${title} · ${stepBaslik}`
        out.push({
          ...base,
          _listRowKey: `${t.id}:sirali:${step.adim_no}`,
          _siraliAdimNo: Number(step.adim_no),
          _siraliStepDurum: stepDurum,
          _assigneeName: assigneeLine,
          _displayBaslik: displayBaslik,
          _taskTypeLabel: `Sıralı · Adım ${step.adim_no}/${total}`,
          _searchText:
            `${baseSearch} ${stepBaslik} ${stepDurum} ${workerName} ${auditorName}`.toLowerCase(),
        })
      }
    }
    return out
  }, [tasks, staffNameMap, unitNameMap, siraliStepsByTaskId])

  const filtered = useMemo(() => {
    const q = String(debouncedSearch || '').trim().toLowerCase()
    const selectedUnitSet = new Set(selectedUnitIds.map((x) => String(x)))
    const nowIso = new Date().toISOString()
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayStartIso = todayStart.toISOString()
    const todayEnd = new Date(todayStart)
    todayEnd.setDate(todayEnd.getDate() + 1)
    const todayEndIso = todayEnd.toISOString()
    const isOverdueTask = (task, normalizedStatus) => {
      const dueIso = task?.son_tarih
      if (!dueIso) return false
      const due = new Date(dueIso)
      if (Number.isNaN(due.getTime()) || due >= new Date(nowIso)) return false
      if (normalizedStatus === TASK_STATUS.APPROVED) return false
      if (
        normalizedStatus === TASK_STATUS.PENDING_APPROVAL ||
        normalizedStatus === TASK_STATUS.RESUBMITTED
      ) {
        const completedAt = new Date(task?.updated_at || task?.created_at || 0)
        if (!Number.isNaN(completedAt.getTime()) && completedAt <= due) return false
      }
      return (
        true
      )
    }
    return preparedTasks.filter((t) => {
      const status = normalizeTaskStatus(t?.durum)
      const overdueSelected = selectedStatus === '__OVERDUE__'
      if ((overdueOnly || overdueSelected) && !isOverdueTask(t, status)) return false
      if (overdueOnly) {
        const createdAtIso = String(t?.created_at || '')
        if (!createdAtIso || createdAtIso < todayStartIso || createdAtIso >= todayEndIso) return false
      }
      if (selectedStatus && selectedStatus !== '__OVERDUE__' && status !== selectedStatus) return false
      if (selectedType && String(t?.gorev_turu || 'normal') !== selectedType) return false
      if (showCompanyFilter && selectedCompanyId && String(t?.ana_sirket_id || '') !== String(selectedCompanyId))
        return false
      if (selectedUnitSet.size > 0 && !selectedUnitSet.has(String(t?.birim_id || ''))) return false
      if (!taskAnchorInDateRange(t, taskDateRange)) return false
      if (!q) return true
      return t._searchText.includes(q)
    })
  }, [
    preparedTasks,
    debouncedSearch,
    selectedStatus,
    selectedType,
    selectedCompanyId,
    selectedUnitIds,
    showCompanyFilter,
    overdueOnly,
    taskDateRange,
  ])

  React.useEffect(() => {
    const p = route?.params || {}
    const reqId = p?.filterRequestId ?? null
    const shouldOverdueOnly = !!p?.initialOverdueTodayOnly
    if (reqId != null && lastOverdueFilterRequestRef.current === reqId) return
    if (shouldOverdueOnly) setOverdueOnly(true)
    if (shouldOverdueOnly) {
      lastOverdueFilterRequestRef.current = reqId ?? Date.now()
      setSelectedStatus('__OVERDUE__')
      setSelectedType('')
      setSelectedCompanyId('')
      setSelectedUnitIds([])
      setSearch('')
      setDebouncedSearch('')
      setShowFilters(false)
      navigation?.setParams?.({
        initialOverdueTodayOnly: undefined,
        filterRequestId: undefined,
      })
    }
  }, [route?.params, navigation])

  const executeApprove = useCallback(
    async (task) => {
      if (!task?.id) return
      setBusyTaskId(task.id)
      try {
        const { error } = await supabase
          .from('isler')
          .update({ durum: TASK_STATUS.APPROVED })
          .eq('id', task.id)
        if (error) throw error
        await logTaskTimelineEvent(task.id, 'review', personel?.id, 'approve')
        Alert.alert('Tamam', 'Görev onaylandı')
        await load()
      } catch (e) {
        Alert.alert('Hata', e?.message || 'Görev onaylanamadı')
      } finally {
        setBusyTaskId(null)
      }
    },
    [load, personel?.id],
  )

  const executeReject = useCallback(
    async (task, trimmed) => {
      if (!task?.id) return
      setBusyTaskId(task.id)
      try {
        if (
          task.gorev_turu === GOREV_TURU.ZINCIR_GOREV ||
          task.gorev_turu === GOREV_TURU.ZINCIR_GOREV_VE_ONAY
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
        Alert.alert('Tamam', 'Görev reddedildi')
        await load()
      } catch (e) {
        Alert.alert('Hata', e?.message || 'Görev reddedilemedi')
      } finally {
        setBusyTaskId(null)
      }
    },
    [load, personel?.id],
  )

  const executeDeletionRequest = useCallback(
    async (task, talepAciklama) => {
      if (!task?.id || !canSubmitDeletion) return
      const aciklama = String(talepAciklama || '').trim()
      if (!aciklama) {
        Alert.alert('Eksik bilgi', 'Silme nedeni zorunludur')
        return
      }
      setBusyTaskId(task.id)
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
        setBusyTaskId(null)
      }
    },
    [canSubmitDeletion, load],
  )

  const renderTaskCard = useCallback(
    ({ item: t }) => {
      const pill = getStatusPillStyle(t?.durum)
      const normalizedStatus = normalizeTaskStatus(t?.durum)
      const isApproved = normalizedStatus === TASK_STATUS.APPROVED
      const isRejected = normalizedStatus === TASK_STATUS.REJECTED
      const unitOk = isUnitInScope(accessibleUnitIds, t?.birim_id)
      const canManageTask =
        (isSystemAdmin || canApproveTask(permissions)) && unitOk
      const isSelfAssigned =
        String(t?.sorumlu_personel_id || '') === String(personel?.id || '')
      const showApproveBtn = canManageTask && isPendingApprovalTaskStatus(t?.durum)
      const approveDisabled = busyTaskId === t.id || isApproved || isSelfAssigned
      const rejectDisabled = busyTaskId === t.id || isApproved || isRejected
      const deletionPending = !!pendingDeletionByIsId[String(t.id)]
      const showDeleteBtn = canSubmitDeletion && unitOk && !deletionPending
      const showEditBtn =
        canOpEdit && unitOk && taskOperationalEditEligible(t) && !deletionPending

      const goDetail = () => navigation.navigate('TaskDetail', { taskId: t.id })
      const goDenetim = () =>
        navigation.navigate('Denetim', { taskId: t.id, openEvidence: true })

      return (
        <View key={t._listRowKey || t.id} style={styles.card}>
          <TouchableOpacity
            onPress={() => {
              if (isPendingApprovalTaskStatus(t?.durum)) {
                goDenetim()
                return
              }
              goDetail()
            }}
            activeOpacity={0.88}
          >
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>{t._displayBaslik || t.baslik || 'Görev'}</Text>
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: pill.backgroundColor, borderColor: pill.borderColor },
                ]}
              >
                <Text style={[styles.statusPillText, { color: pill.textColor }]}>
                  {normalizedStatus || '-'}
                </Text>
              </View>
            </View>
            {t._siraliAdimNo != null && t._siraliStepDurum ? (
              <Text style={{ fontSize: 12, color: Colors.mutedText, fontWeight: '700', marginBottom: 6 }}>
                Adım durumu: {t._siraliStepDurum}
              </Text>
            ) : null}
            <View style={styles.metaBox}>
              <View style={styles.metaGrid3}>
                <View style={styles.metaColumn}>
                  <Text style={styles.metaLabel}>Sorumlu</Text>
                  <Text style={styles.metaValue} numberOfLines={1} ellipsizeMode="tail">
                    {t._assigneeName}
                  </Text>
                </View>
                <View style={styles.metaDivider} />
                <View style={styles.metaColumn}>
                  <Text style={styles.metaLabel}>Birim</Text>
                  <Text style={styles.metaValue} numberOfLines={1} ellipsizeMode="tail">
                    {t._unitName}
                  </Text>
                </View>
                <View style={styles.metaDivider} />
                <View style={styles.metaColumn}>
                  <Text style={styles.metaLabel}>Tür</Text>
                  <Text style={styles.metaValue} numberOfLines={1} ellipsizeMode="tail">
                    {t._taskTypeLabel}
                  </Text>
                </View>
              </View>
              <View style={styles.metaAssignerRow}>
                <Text style={styles.metaLabel}>Görev atayan</Text>
                <Text style={styles.metaValue} numberOfLines={1} ellipsizeMode="tail">
                  {t._assignerName}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          <View style={styles.actionsRow}>
            {showApproveBtn ? (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionApprove, approveDisabled && styles.actionDisabled]}
                  disabled={approveDisabled}
                  onPress={() => {
                    if (approveDisabled) return
                    Alert.alert('Görevi onayla', 'Bu görevi onaylamak istediğinize emin misiniz?', [
                      { text: 'İptal', style: 'cancel' },
                      { text: 'Onayla', onPress: () => void executeApprove(t) },
                    ])
                  }}
                >
                  <Text style={styles.actionBtnText}>Onayla</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionReject, rejectDisabled && styles.actionDisabled]}
                  disabled={rejectDisabled}
                  onPress={() => {
                    if (rejectDisabled) return
                    setReasonDraft('')
                    setActionModal({ type: 'reject', task: t })
                  }}
                >
                  <Text style={styles.actionBtnText}>Reddet</Text>
                </TouchableOpacity>
              </>
            ) : null}
            {showDeleteBtn ? (
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionDelete, busyTaskId === t.id && styles.actionDisabled]}
                disabled={busyTaskId === t.id}
                onPress={() => {
                  setReasonDraft('')
                  setActionModal({ type: 'delete', task: t })
                }}
              >
                <Text style={styles.actionBtnText}>Sil</Text>
              </TouchableOpacity>
            ) : null}
            {showEditBtn ? (
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionEdit, busyTaskId === t.id && styles.actionDisabled]}
                disabled={busyTaskId === t.id}
                onPress={() => navigation.navigate('TaskOperationalEdit', { taskId: t.id })}
              >
                <Text style={[styles.actionBtnText, styles.actionEditText]}>Düzenle</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[styles.actionBtn, styles.actionDetail]} onPress={goDetail}>
              <Text style={[styles.actionBtnText, styles.actionDetailText]}>Detay</Text>
            </TouchableOpacity>
          </View>
        </View>
      )
    },
    [
      navigation,
      accessibleUnitIds,
      permissions,
      personel?.id,
      isSystemAdmin,
      busyTaskId,
      pendingDeletionByIsId,
      canSubmitDeletion,
      canOpEdit,
      executeApprove,
      executeReject,
      executeDeletionRequest,
    ],
  )

  if (!canUseScreen) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Bu ekran için yetkiniz yok.</Text>
      </View>
    )
  }

  return (
    <View style={styles.page}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>İşler</Text>
          <Text style={styles.subtitle}>Tüm görevler</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {canDeletionApprove ? (
            <TouchableOpacity
              style={styles.filterBtn}
              onPress={() => navigation.navigate('TaskDeletionCenter')}
              activeOpacity={0.85}
            >
              <Text style={styles.filterBtnText}>Silme</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.filterBtn} onPress={() => setShowFilters(true)} activeOpacity={0.85}>
            <Text style={styles.filterBtnText}>Filtreler</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Başlık, açıklama veya personel ara"
        placeholderTextColor={Colors.mutedText}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size={30} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item._listRowKey || item.id)}
          renderItem={renderTaskCard}
          contentContainerStyle={{ paddingBottom: 120 }}
          initialNumToRender={10}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
          ListEmptyComponent={<Text style={styles.emptyText}>Filtreye uygun görev yok.</Text>}
        />
      )}

      <Modal
        visible={showFilters}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setTaskDatePickerField(null)
          setShowFilters(false)
        }}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            setTaskDatePickerField(null)
            setShowFilters(false)
          }}
        >
          <Pressable style={styles.offcanvas} onPress={() => {}}>
            <View style={styles.offcanvasHeader}>
              <Text style={styles.offTitle}>Filtreler</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => {
                  setTaskDatePickerField(null)
                  setShowFilters(false)
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.closeBtnText}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
              <View style={styles.filterSection}>
                <Text style={styles.label}>Durum</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
                  <TouchableOpacity
                    style={[styles.chip, !selectedStatus && styles.chipActive]}
                    onPress={() => {
                      setSelectedStatus('')
                      setOverdueOnly(false)
                    }}
                  >
                    <Text style={[styles.chipText, !selectedStatus && styles.chipTextActive]}>Tümü</Text>
                  </TouchableOpacity>
                  {STATUS_OPTIONS.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.chip, selectedStatus === s && styles.chipActive]}
                      onPress={() => {
                        setSelectedStatus(s)
                        if (s !== '__OVERDUE__') setOverdueOnly(false)
                      }}
                    >
                      <Text style={[styles.chipText, selectedStatus === s && styles.chipTextActive]}>
                        {statusOptionLabel(s)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.label}>Görev tipi</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
                  <TouchableOpacity style={[styles.chip, !selectedType && styles.chipActive]} onPress={() => setSelectedType('')}>
                    <Text style={[styles.chipText, !selectedType && styles.chipTextActive]}>Tümü</Text>
                  </TouchableOpacity>
                  {TASK_TYPE_OPTIONS.map((opt) => (
                    <TouchableOpacity key={opt.value} style={[styles.chip, selectedType === opt.value && styles.chipActive]} onPress={() => setSelectedType(opt.value)}>
                      <Text style={[styles.chipText, selectedType === opt.value && styles.chipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {showCompanyFilter ? (
                <View style={styles.filterSection}>
                  <Text style={styles.label}>Şirket</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
                    <TouchableOpacity style={[styles.chip, !selectedCompanyId && styles.chipActive]} onPress={() => setSelectedCompanyId('')}>
                      <Text style={[styles.chipText, !selectedCompanyId && styles.chipTextActive]}>Tümü</Text>
                    </TouchableOpacity>
                    {companies.map((c) => (
                      <TouchableOpacity key={c.id} style={[styles.chip, selectedCompanyId === String(c.id) && styles.chipActive]} onPress={() => setSelectedCompanyId(String(c.id))}>
                        <Text style={[styles.chipText, selectedCompanyId === String(c.id) && styles.chipTextActive]}>{c.ana_sirket_adi}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <View style={styles.filterSection}>
                <Text style={styles.label}>Tarih aralığı</Text>
                <Text style={styles.dateHint}>
                  Görevin liste tarihi: başlama → görünür → oluşturulma sırası.
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
                  <TouchableOpacity
                    style={[styles.chip, taskDatePreset === TASK_DATE_PRESET_ALL && styles.chipActive]}
                    onPress={() => {
                      setTaskDatePreset(TASK_DATE_PRESET_ALL)
                      setTaskDateCustomStart(null)
                      setTaskDateCustomEnd(null)
                      setTaskDatePickerField(null)
                    }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        taskDatePreset === TASK_DATE_PRESET_ALL && styles.chipTextActive,
                      ]}
                    >
                      Tümü
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.chip, taskDatePreset === TASK_DATE_PRESET_TODAY && styles.chipActive]}
                    onPress={() => {
                      setTaskDatePreset(TASK_DATE_PRESET_TODAY)
                      setTaskDateCustomStart(null)
                      setTaskDateCustomEnd(null)
                      setTaskDatePickerField(null)
                    }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        taskDatePreset === TASK_DATE_PRESET_TODAY && styles.chipTextActive,
                      ]}
                    >
                      Bugün
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.chip, taskDatePreset === TASK_DATE_PRESET_WEEK && styles.chipActive]}
                    onPress={() => {
                      setTaskDatePreset(TASK_DATE_PRESET_WEEK)
                      setTaskDateCustomStart(null)
                      setTaskDateCustomEnd(null)
                      setTaskDatePickerField(null)
                    }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        taskDatePreset === TASK_DATE_PRESET_WEEK && styles.chipTextActive,
                      ]}
                    >
                      Bu hafta
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.chip, taskDatePreset === TASK_DATE_PRESET_MONTH && styles.chipActive]}
                    onPress={() => {
                      setTaskDatePreset(TASK_DATE_PRESET_MONTH)
                      setTaskDateCustomStart(null)
                      setTaskDateCustomEnd(null)
                      setTaskDatePickerField(null)
                    }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        taskDatePreset === TASK_DATE_PRESET_MONTH && styles.chipTextActive,
                      ]}
                    >
                      Bu ay
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.chip, taskDatePreset === TASK_DATE_PRESET_3MONTHS && styles.chipActive]}
                    onPress={() => {
                      setTaskDatePreset(TASK_DATE_PRESET_3MONTHS)
                      setTaskDateCustomStart(null)
                      setTaskDateCustomEnd(null)
                      setTaskDatePickerField(null)
                    }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        taskDatePreset === TASK_DATE_PRESET_3MONTHS && styles.chipTextActive,
                      ]}
                    >
                      Son 3 ay
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.chip, taskDatePreset === TASK_DATE_PRESET_CUSTOM && styles.chipActive]}
                    onPress={() => setTaskDatePreset(TASK_DATE_PRESET_CUSTOM)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        taskDatePreset === TASK_DATE_PRESET_CUSTOM && styles.chipTextActive,
                      ]}
                    >
                      Özel
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
                {taskDatePreset === TASK_DATE_PRESET_CUSTOM ? (
                  <View style={styles.dateRangeRow}>
                    <TouchableOpacity
                      style={[
                        styles.dateBox,
                        taskDatePickerField === 'start' && styles.dateBoxActive,
                      ]}
                      activeOpacity={0.85}
                      onPress={() => setTaskDatePickerField('start')}
                    >
                      <Text style={styles.dateBoxLabel}>Başlangıç</Text>
                      <Text style={styles.dateBoxValue}>
                        {taskDateCustomStart
                          ? new Date(taskDateCustomStart).toLocaleDateString('tr-TR')
                          : '--'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.dateBox,
                        taskDatePickerField === 'end' && styles.dateBoxActive,
                      ]}
                      activeOpacity={0.85}
                      onPress={() => setTaskDatePickerField('end')}
                    >
                      <Text style={styles.dateBoxLabel}>Bitiş</Text>
                      <Text style={styles.dateBoxValue}>
                        {taskDateCustomEnd
                          ? new Date(taskDateCustomEnd).toLocaleDateString('tr-TR')
                          : '--'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {taskDatePreset === TASK_DATE_PRESET_CUSTOM &&
                (!taskDateCustomStart || !taskDateCustomEnd) ? (
                  <Text style={styles.dateIncompleteHint}>Özel aralık için iki tarihi de seçin.</Text>
                ) : null}
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.label}>Birimler</Text>
                <ScrollView style={styles.unitsList}>
                  {units.map((u) => {
                    const active = selectedUnitIds.some((x) => String(x) === String(u.id))
                    return (
                      <TouchableOpacity
                        key={u.id}
                        style={[styles.rowItem, active && styles.rowItemActive]}
                        onPress={() =>
                          setSelectedUnitIds((prev) =>
                            active
                              ? prev.filter((x) => String(x) !== String(u.id))
                              : [...prev, String(u.id)],
                          )
                        }
                      >
                        <Text style={styles.rowItemText}>{u.birim_adi}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              </View>
            </ScrollView>

            {taskDatePickerField && Platform.OS === 'android' ? (
              <DateTimePicker
                value={
                  taskDatePickerField === 'start'
                    ? taskDateCustomStart || new Date()
                    : taskDateCustomEnd || new Date()
                }
                mode="date"
                display="default"
                onChange={onTaskDateAndroidChange}
              />
            ) : null}

            <View style={styles.offcanvasActions}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { flex: 1 }]}
                onPress={() => {
                  setSelectedStatus('')
                  setOverdueOnly(false)
                  setSelectedType('')
                  setSelectedUnitIds([])
                  setTaskDatePreset(TASK_DATE_PRESET_ALL)
                  setTaskDateCustomStart(null)
                  setTaskDateCustomEnd(null)
                  setTaskDatePickerField(null)
                  if (showCompanyFilter) setSelectedCompanyId('')
                }}
              >
                <Text style={styles.secondaryBtnText}>Temizle</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterBtn, { flex: 1 }]}
                onPress={() => {
                  setTaskDatePickerField(null)
                  setShowFilters(false)
                }}
              >
                <Text style={styles.filterBtnText}>Uygula</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showFilters && !!taskDatePickerField && Platform.OS === 'ios'}
        transparent
        animationType="slide"
        onRequestClose={() => setTaskDatePickerField(null)}
      >
        <Pressable style={styles.taskDateIosBackdrop} onPress={() => setTaskDatePickerField(null)}>
          <Pressable style={styles.taskDateIosSheet} onPress={() => {}}>
            <View style={styles.taskDateIosBar}>
              <TouchableOpacity onPress={() => setTaskDatePickerField(null)} activeOpacity={0.85}>
                <Text style={styles.taskDateIosDone}>Tamam</Text>
              </TouchableOpacity>
            </View>
            {taskDatePickerField ? (
              <DateTimePicker
                value={
                  taskDatePickerField === 'start'
                    ? taskDateCustomStart || new Date()
                    : taskDateCustomEnd || new Date()
                }
                mode="date"
                display="spinner"
                onChange={(_, d) => {
                  if (!d || !taskDatePickerField) return
                  if (taskDatePickerField === 'start') setTaskDateCustomStart(d)
                  else setTaskDateCustomEnd(d)
                }}
              />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!actionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setActionModal(null)}
      >
        <Pressable style={styles.reasonBackdrop} onPress={() => setActionModal(null)}>
          <Pressable style={styles.reasonSheet} onPress={() => {}}>
            <Text style={styles.reasonTitle}>
              {actionModal?.type === 'reject' ? 'Red nedeni' : 'Silme nedeni'}
            </Text>
            <TextInput
              style={styles.reasonInput}
              multiline
              value={reasonDraft}
              onChangeText={setReasonDraft}
              placeholder={
                actionModal?.type === 'reject' ? 'Red gerekçesini yazın…' : 'Silme gerekçesini yazın…'
              }
              placeholderTextColor={Colors.mutedText}
            />
            <View style={styles.reasonActions}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { flex: 1 }]}
                onPress={() => {
                  setActionModal(null)
                  setReasonDraft('')
                }}
              >
                <Text style={styles.secondaryBtnText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterBtn, { flex: 1 }]}
                onPress={() => {
                  const text = reasonDraft.trim()
                  if (!text) {
                    Alert.alert(
                      'Eksik bilgi',
                      actionModal?.type === 'reject'
                        ? 'Red nedeni zorunludur'
                        : 'Silme nedeni zorunludur',
                    )
                    return
                  }
                  const task = actionModal?.task
                  const typ = actionModal?.type
                  setActionModal(null)
                  setReasonDraft('')
                  if (typ === 'reject' && task) void executeReject(task, text)
                  else if (typ === 'delete' && task) void executeDeletionRequest(task, text)
                }}
              >
                <Text style={styles.filterBtnText}>
                  {actionModal?.type === 'reject' ? 'Reddet' : 'Onaya gönder'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.background, padding: Spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: Typography.heading.fontSize, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: Typography.caption.fontSize, color: Colors.mutedText, marginTop: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  search: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: Radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    marginBottom: 10,
    color: Colors.text,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 1,
  },
  card: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: Radii.md,
    backgroundColor: Colors.surface,
    padding: 11,
    marginBottom: 8,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 2,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  cardTitle: { fontSize: Typography.body.fontSize, fontWeight: '700', color: Colors.text, marginBottom: 0, flex: 1 },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillText: { fontSize: 11, fontWeight: '800' },
  metaBox: {
    borderWidth: 1,
    borderColor: '#d8e2ee',
    borderRadius: Radii.sm,
    backgroundColor: '#f3f7fc',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  metaGrid3: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaAssignerRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#d7e0eb',
    gap: 2,
  },
  metaColumn: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 6,
    gap: 2,
  },
  metaDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#d7e0eb',
    marginVertical: 2,
  },
  metaLabel: {
    fontSize: 10.5,
    color: '#64748b',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  metaValue: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '600',
    lineHeight: 16,
  },
  emptyText: { color: Colors.mutedText, textAlign: 'center', marginTop: 18 },
  filterBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radii.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnText: { color: Colors.surface, fontWeight: '700', fontSize: Typography.caption.fontSize },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', justifyContent: 'flex-end', alignItems: 'flex-end' },
  offcanvas: {
    width: '86%',
    height: '100%',
    backgroundColor: Colors.surface,
    paddingTop: 50,
    paddingHorizontal: 14,
    borderTopLeftRadius: Radii.lg,
    borderBottomLeftRadius: Radii.lg,
  },
  offcanvasHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  offTitle: { fontSize: Typography.heading.fontSize, fontWeight: '800', color: Colors.text, marginBottom: 10 },
  closeBtn: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.surface,
  },
  closeBtnText: { color: Colors.text, fontSize: Typography.caption.fontSize, fontWeight: '700' },
  label: { fontSize: Typography.caption.fontSize, fontWeight: '700', color: Colors.text, marginBottom: 6, marginTop: 4 },
  filterScrollContent: { paddingBottom: 14 },
  filterSection: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: Radii.md,
    backgroundColor: '#f8fafc',
    padding: 10,
    marginBottom: 10,
  },
  dateHint: {
    fontSize: 11,
    color: Colors.mutedText,
    marginBottom: 8,
    lineHeight: 15,
  },
  dateRangeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  dateBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: Radii.sm,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: Colors.surface,
  },
  dateBoxActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.alpha.indigo10,
  },
  dateBoxLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.mutedText,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  dateBoxValue: {
    fontSize: Typography.caption.fontSize,
    fontWeight: '700',
    color: Colors.text,
  },
  dateIncompleteHint: {
    marginTop: 8,
    fontSize: 11,
    color: '#b45309',
    fontWeight: '600',
  },
  taskDateIosBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  taskDateIosSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radii.lg,
    borderTopRightRadius: Radii.lg,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: Colors.alpha.gray20,
  },
  taskDateIosBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.alpha.gray20,
  },
  taskDateIosDone: {
    fontSize: Typography.caption.fontSize,
    fontWeight: '800',
    color: Colors.primary,
  },
  chipsRow: { marginBottom: 2 },
  chip: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginRight: 8,
    backgroundColor: Colors.surface,
  },
  chipActive: { backgroundColor: Colors.alpha.indigo15, borderColor: Colors.primary },
  chipText: { color: Colors.text, fontSize: Typography.caption.fontSize, fontWeight: '600' },
  chipTextActive: { color: Colors.primary, fontWeight: '800' },
  rowItem: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: Radii.sm,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  rowItemActive: { borderColor: Colors.primary, backgroundColor: Colors.alpha.indigo10 },
  rowItemText: { color: Colors.text, fontSize: Typography.caption.fontSize, fontWeight: '600' },
  unitsList: { maxHeight: 220 },
  offcanvasActions: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 20 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: Radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  secondaryBtnText: { color: Colors.text, fontSize: Typography.caption.fontSize, fontWeight: '700' },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  actionBtn: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: Radii.sm,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 11.5, fontWeight: '800', color: Colors.surface },
  actionApprove: { backgroundColor: '#16a34a', borderColor: '#15803d' },
  actionReject: { backgroundColor: '#dc2626', borderColor: '#b91c1c' },
  actionDelete: { backgroundColor: '#ea580c', borderColor: '#c2410c' },
  actionEdit: { backgroundColor: Colors.surface, borderColor: '#93c5fd' },
  actionEditText: { color: '#1d4ed8' },
  actionDetail: { backgroundColor: Colors.surface, borderColor: Colors.alpha.indigo15 },
  actionDetailText: { color: Colors.primary },
  actionDisabled: { opacity: 0.45 },
  reasonBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  reasonSheet: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
  },
  reasonTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 10,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: Radii.md,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
    color: Colors.text,
    marginBottom: 14,
  },
  reasonActions: { flexDirection: 'row', gap: 10 },
})

