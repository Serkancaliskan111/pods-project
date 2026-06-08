import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import getSupabase from '../../../../lib/supabaseClient'
import { AuthContext } from '../../../../contexts/AuthContext.jsx'
import {
  canRequestTaskDeletion,
  canOperationallyEditAssignedTask,
  hasManagementDashboardAccess,
  canAssignTask,
} from '../../../../lib/permissions.js'
import { enrichTasksWithWorkActions } from '../../../../lib/enrichTasksWorkActions.js'
import { isUnitInScope } from '../../../../lib/supabaseScope.js'
import { taskOperationalEditEligible } from '../../../../lib/taskStatus.js'
import { getTaskTypeLabel } from '../lib/taskTypeLabels.js'
import {
  filterByListMode,
  groupCompletedByTime,
  groupPendingByTime,
  matchesQuickFilter,
  normalizeQuickFilterForAssignPermission,
} from '../lib/tasksListGrouping.js'
import { isListedTaskVisibleForAssignee } from '../../../../lib/taskVisibility.js'
import {
  enrichScopeForTasks,
  fetchPendingDeletionMap,
  loadTasksListData,
} from '../lib/tasksListLoadUtils.js'

const supabase = getSupabase()

export function useTasksListPage(listMode) {
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
  const canSubmitDeletionRequest = canRequestTaskDeletion(permissions)
  const canOpEditTasks =
    isSystemAdmin || canOperationallyEditAssignedTask(permissions, false)
  const canAssign = canAssignTask(permissions, isSystemAdmin, personel)
  const operatorMode = !hasManagementDashboardAccess(permissions, isSystemAdmin)

  const [tasks, setTasks] = useState([])
  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [actioningTaskId, setActioningTaskId] = useState(null)
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilterState] = useState('all')

  const setQuickFilter = useCallback(
    (value) => {
      setQuickFilterState(normalizeQuickFilterForAssignPermission(value, canAssign, 'all'))
    },
    [canAssign],
  )

  useEffect(() => {
    setQuickFilterState((prev) => normalizeQuickFilterForAssignPermission(prev, canAssign, 'all'))
  }, [canAssign])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedTaskType, setSelectedTaskType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedUnitIds, setSelectedUnitIds] = useState([])
  const [isUnitMenuOpen, setIsUnitMenuOpen] = useState(false)
  const [pendingDeletionByIsId, setPendingDeletionByIsId] = useState({})
  const [extraStaffLabels, setExtraStaffLabels] = useState({})
  const [confirmCtx, setConfirmCtx] = useState(null)
  const unitMenuRef = useRef(null)
  const hasLoadedRef = useRef(false)
  const enrichGenRef = useRef(0)

  const load = useCallback(async () => {
    if (!canLoadWithScope) return
    if (!hasLoadedRef.current) setLoading(true)
    const enrichGen = enrichGenRef.current + 1
    enrichGenRef.current = enrichGen
    try {
      const scope = operatorMode
        ? { isSystemAdmin, currentCompanyId, accessibleUnitIds }
        : await enrichScopeForTasks(supabase, {
            isSystemAdmin,
            currentCompanyId,
            accessibleUnitIds,
          })
      const result = await loadTasksListData({
        supabase,
        scope,
        personel,
        isSystemAdmin,
        currentCompanyId,
        operatorMode,
      })
      if (result.error) {
        console.error(result.error)
        toast.error('Görevler yüklenemedi')
        setTasks([])
      } else {
        setCompanies(result.companies)
        setUnits(result.units)
        setStaff(result.staff)
        setTasks(result.tasks)
        hasLoadedRef.current = true

        if (result.needsWorkActionEnrich && personel?.id && result.tasks?.length) {
          enrichTasksWithWorkActions(supabase, result.tasks, personel.id)
            .then((withActions) => {
              if (enrichGenRef.current !== enrichGen) return
              setTasks(withActions)
            })
            .catch((e) => {
              console.warn('[useTasksListPage] enrichTasksWithWorkActions', e)
            })
        }
      }
    } finally {
      setLoading(false)
    }
  }, [canLoadWithScope, isSystemAdmin, currentCompanyId, personel?.id, accessibleUnitIds, operatorMode])

  useEffect(() => {
    if (operatorMode) setQuickFilter('assigned_to_me')
  }, [operatorMode])

  useEffect(() => {
    if (companyScoped && currentCompanyId) {
      setSelectedCompanyId(String(currentCompanyId))
    }
  }, [companyScoped, currentCompanyId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!tasks.length) {
      setPendingDeletionByIsId({})
      return
    }
    let cancelled = false
    ;(async () => {
      const ids = tasks.map((t) => t.id).filter(Boolean)
      const map = await fetchPendingDeletionMap(supabase, ids)
      if (!cancelled) setPendingDeletionByIsId(map)
    })()
    return () => {
      cancelled = true
    }
  }, [tasks])

  useEffect(() => {
    const onClickOutside = (e) => {
      if (!unitMenuRef.current?.contains(e.target)) setIsUnitMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const companyNameById = useMemo(
    () =>
      (companies || []).reduce((acc, c) => {
        acc[String(c.id)] = c?.ana_sirket_adi || '-'
        return acc
      }, {}),
    [companies],
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
  const getTaskContextLabel = (task) =>
    task?._projectTitle || task?.projectLabel || getCompanyName(task?.ana_sirket_id)
  const getStaffName = (id) => {
    if (!id) return '-'
    const k = String(id)
    return staffNameById[k] || extraStaffLabels[k] || '-'
  }

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
      units.filter((u) => {
        if (!u?.id) return false
        if (companyScoped) return true
        if (!selectedCompanyId) return true
        return String(u.ana_sirket_id) === String(selectedCompanyId)
      }),
    [units, companyScoped, selectedCompanyId],
  )

  const toggleUnitSelection = (unitId) => {
    const id = String(unitId)
    setSelectedUnitIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    )
  }

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim()
    const now = new Date()
    return (tasks || []).filter((t) => {
      if (!filterByListMode(t, listMode)) return false
      if (!matchesQuickFilter(t, quickFilter, personel?.id)) return false
      if (operatorMode && !isListedTaskVisibleForAssignee(t, now)) return false

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

      return matchesSearch && matchesCompany && matchesTaskType && matchesUnit && matchesDate
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
    companyNameById,
    staffNameById,
  ])

  const pendingGroups = useMemo(() => {
    if (listMode !== 'pending') return null
    const { today, tomorrow, week, other } = groupPendingByTime(filtered)
    return { today, tomorrow, week, other }
  }, [listMode, filtered])

  const completedGroups = useMemo(() => {
    if (listMode !== 'completed') return null
    return groupCompletedByTime(filtered)
  }, [listMode, filtered])

  const getCardActions = (task) => {
    const deleteScopeOk =
      !accessibleUnitIds?.length || isUnitInScope(accessibleUnitIds, task.birim_id)
    const editScopeOk = deleteScopeOk
    const deletionPending = !!pendingDeletionByIsId[String(task.id)]
    return {
      showDelete: canSubmitDeletionRequest && deleteScopeOk && !deletionPending,
      showEdit:
        canOpEditTasks && editScopeOk && taskOperationalEditEligible(task) && !deletionPending,
      deletionPending,
    }
  }

  return {
    loading,
    reload: load,
    filtered,
    pendingGroups,
    completedGroups,
    companies,
    companyScoped,
    currentCompanyId,
    selectedCompanyId,
    setSelectedCompanyId,
    selectedTaskType,
    setSelectedTaskType,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    selectedUnitIds,
    setSelectedUnitIds,
    toggleUnitSelection,
    availableUnitOptions,
    taskTypeOptions,
    isUnitMenuOpen,
    setIsUnitMenuOpen,
    unitMenuRef,
    search,
    setSearch,
    quickFilter,
    setQuickFilter,
    actioningTaskId,
    setActioningTaskId,
    confirmCtx,
    setConfirmCtx,
    getCompanyName,
    getTaskContextLabel,
    getStaffName,
    getTaskTypeLabel,
    getCardActions,
    personel,
    canAssign,
  }
}
