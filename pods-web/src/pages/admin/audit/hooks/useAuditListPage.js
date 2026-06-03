import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import getSupabase from '../../../../lib/supabaseClient'
import { AuthContext } from '../../../../contexts/AuthContext.jsx'
import { canApproveTask } from '../../../../lib/permissions.js'
import {
  scopeAnaSirketlerQuery,
  scopeBirimlerQuery,
  scopeIslerQuery,
  enrichScopeWithJunctionPersonelIds,
  scopePersonelQuery,
  isUnitInScope,
  TASKS_LIST_LIMIT,
} from '../../../../lib/supabaseScope.js'
import {
  TASK_STATUS,
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
  normalizeTaskStatus,
} from '../../../../lib/taskStatus.js'
import { isTaskVisibleNow, isTaskVisibleToPerson } from '../../../../lib/taskVisibility.js'
import { groupTasksByGrupId } from '../../../../lib/groupTasks.js'
import { getTaskTypeLabel } from '../../tasks/lib/taskTypeLabels.js'
import {
  groupCompletedByTime,
  matchesQuickFilter,
  sortAuditPendingTasksOldestFirst,
} from '../../tasks/lib/tasksListGrouping.js'

const supabase = getSupabase()

const JOBS_SELECT =
  'id,baslik,aciklama,durum,created_at,updated_at,son_tarih,baslama_tarihi,ana_sirket_id,birim_id,sorumlu_personel_id,atayan_personel_id,gorev_turu,is_sablon_id,grup_id,kanit_resim_ler,kanit_videolar,personel_tamamlama_notu,acil,ozel_gorev'

function isPendingAuditStatus(durum) {
  const n = normalizeTaskStatus(durum)
  return n === TASK_STATUS.PENDING_APPROVAL || n === TASK_STATUS.RESUBMITTED
}

async function enrichPoolGroupRows(submitted) {
  const grupIds = [...new Set(submitted.map((r) => r?.grup_id).filter(Boolean))]
  if (!grupIds.length) return submitted
  const { data: groupMates } = await supabase
    .from('isler')
    .select(JOBS_SELECT)
    .in('grup_id', grupIds)
  if (!Array.isArray(groupMates) || !groupMates.length) return submitted
  const seen = new Set(submitted.map((r) => String(r?.id)))
  let enriched = [...submitted]
  for (const r of groupMates) {
    if (!seen.has(String(r?.id))) {
      enriched = [...enriched, r]
      seen.add(String(r?.id))
    }
  }
  return enriched
}

export function useAuditListPage(auditMode) {
  const { profile, personel, scopeReady } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const permissions = profile?.yetkiler || {}
  const canReview = isSystemAdmin || canApproveTask(permissions)
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

  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState([])
  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [staff, setStaff] = useState([])
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState('all')
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedTaskType, setSelectedTaskType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedUnitIds, setSelectedUnitIds] = useState([])
  const [isUnitMenuOpen, setIsUnitMenuOpen] = useState(false)
  const unitMenuRef = useRef(null)

  const load = useCallback(async () => {
    if (!canLoadWithScope || !canReview) return
    setLoading(true)
    const scope = await enrichScopeWithJunctionPersonelIds(supabase, {
      isSystemAdmin,
      currentCompanyId,
      accessibleUnitIds,
    })
    try {
      const [{ data: comps }, { data: unitsData }, { data: staffData }, jobsRes] = await Promise.all([
        scopeAnaSirketlerQuery(
          supabase.from('ana_sirketler').select('id,ana_sirket_adi').is('silindi_at', null),
          scope,
        ),
        scopeBirimlerQuery(
          supabase.from('birimler').select('id,birim_adi,ana_sirket_id').is('silindi_at', null),
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
            .select(JOBS_SELECT)
            .order('updated_at', { ascending: false })
            .limit(TASKS_LIST_LIMIT),
          scope,
        ),
      ])
      if (jobsRes.error) throw jobsRes.error

      let rows = (jobsRes.data || []).filter(
        (t) => isTaskVisibleNow(t) && isTaskVisibleToPerson(t, personel?.id),
      )

      if (auditMode === 'pending') {
        rows = rows.filter((t) => isPendingAuditStatus(t?.durum))
        rows = await enrichPoolGroupRows(rows)
      } else {
        rows = rows.filter((t) => isApprovedTaskStatus(t?.durum))
      }

      const { items: grouped } = groupTasksByGrupId(rows)
      setTasks(grouped)
      setCompanies(comps || [])
      setUnits(unitsData || [])
      setStaff(staffData || [])
    } catch (e) {
      console.error(e)
      toast.error('Denetim görevleri yüklenemedi')
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [canLoadWithScope, canReview, isSystemAdmin, currentCompanyId, accessibleUnitIds, personel?.id, auditMode])

  useEffect(() => {
    if (companyScoped && currentCompanyId) setSelectedCompanyId(String(currentCompanyId))
  }, [companyScoped, currentCompanyId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onClickOutside = (e) => {
      if (unitMenuRef.current && !unitMenuRef.current.contains(e.target)) {
        setIsUnitMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const companyNameById = useMemo(
    () => Object.fromEntries((companies || []).map((c) => [String(c.id), c.ana_sirket_adi || '-'])),
    [companies],
  )
  const unitNameById = useMemo(
    () => Object.fromEntries((units || []).map((u) => [String(u.id), u.birim_adi || '-'])),
    [units],
  )
  const staffNameById = useMemo(
    () =>
      Object.fromEntries(
        (staff || []).map((s) => [
          String(s.id),
          s?.ad || s?.soyad ? `${s.ad || ''} ${s.soyad || ''}`.trim() : s?.email || '-',
        ]),
      ),
    [staff],
  )

  const getCompanyName = (id) => companyNameById[String(id)] || '-'
  const getStaffName = (id) => (id ? staffNameById[String(id)] || '-' : '-')

  const taskTypeOptions = useMemo(
    () =>
      Array.from(
        new Set([
          'normal',
          'sablon_gorev',
          'zincir_gorev',
          'zincir_onay',
          'sirali_gorev',
          ...tasks.map((t) => String(t?.gorev_turu || '').trim()).filter(Boolean),
        ]),
      ).sort((a, b) => getTaskTypeLabel(a).localeCompare(getTaskTypeLabel(b), 'tr')),
    [tasks],
  )

  const availableUnitOptions = useMemo(
    () =>
      (units || [])
        .filter((u) => {
          if (!u?.id) return false
          if (companyScoped) return true
          if (!selectedCompanyId) return true
          return String(u.ana_sirket_id) === String(selectedCompanyId)
        })
        .filter(
          (u) =>
            !accessibleUnitIds?.length || isUnitInScope(accessibleUnitIds, u.id),
        ),
    [units, companyScoped, selectedCompanyId, accessibleUnitIds],
  )

  const toggleUnitSelection = (unitId) => {
    const id = String(unitId)
    setSelectedUnitIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    )
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (tasks || []).filter((t) => {
      if (!matchesQuickFilter(t, quickFilter, personel?.id)) return false

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

      const points = [t.baslama_tarihi, t.son_tarih, t.created_at, t.updated_at]
        .map((v) => {
          if (!v) return null
          const d = new Date(v)
          return Number.isNaN(d.getTime()) ? null : d.getTime()
        })
        .filter(Boolean)
      const startMs = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null
      const endMs = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : null
      const matchesDate =
        auditMode === 'pending'
          ? true
          : !startMs && !endMs
            ? true
            : points.some((pt) => {
                if (startMs != null && pt < startMs) return false
                if (endMs != null && pt > endMs) return false
                return true
              })

      if (!term) {
        return matchesCompany && matchesTaskType && matchesUnit && matchesDate
      }

      const haystack = [
        t.baslik,
        getCompanyName(t.ana_sirket_id),
        getStaffName(t.sorumlu_personel_id),
        getStaffName(t.atayan_personel_id),
      ]
        .join(' ')
        .toLowerCase()

      return (
        matchesCompany &&
        matchesTaskType &&
        matchesUnit &&
        matchesDate &&
        haystack.includes(term)
      )
    })
  }, [
    auditMode,
    tasks,
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

  const sortedPendingTasks = useMemo(() => {
    if (auditMode !== 'pending') return []
    return sortAuditPendingTasksOldestFirst(filtered)
  }, [auditMode, filtered])

  const approvedGroups = useMemo(() => {
    if (auditMode !== 'approved') return null
    return groupCompletedByTime(filtered)
  }, [auditMode, filtered])

  return {
    canReview,
    loading,
    reload: load,
    filtered,
    sortedPendingTasks,
    approvedGroups,
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
    getCompanyName,
    getStaffName,
    getTaskTypeLabel,
    personel,
  }
}
