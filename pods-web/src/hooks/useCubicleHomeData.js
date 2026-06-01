import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import getSupabase from '../lib/supabaseClient'
import { AuthContext } from '../contexts/AuthContext.jsx'
import {
  enrichScopeWithJunctionPersonelIds,
  scopeIslerQuery,
  scopePersonelQuery,
} from '../lib/supabaseScope.js'
import {
  isApprovedTaskStatus,
  normalizeTaskStatus,
  TASK_STATUS,
} from '../lib/taskStatus.js'
import { isTaskVisibleNow } from '../lib/taskVisibility.js'
import { hasManagementDashboardAccess } from '../lib/permissions.js'
import { enrichTasksWithWorkActions } from '../lib/enrichTasksWorkActions.js'
import { isSiraliGorevTuru, isZincirGorevTuru, isZincirOnayTuru } from '../lib/zincirTasks.js'

function taskNeedsWorkActionEnrich(task) {
  const t = task?.gorev_turu
  return isSiraliGorevTuru(t) || isZincirGorevTuru(t) || isZincirOnayTuru(t)
}
import {
  enrichOperatorHomeTasks,
  fetchOperatorHomeTasksBase,
  loadCubicleHomeTasks,
} from '../lib/loadCubicleHomeTasks.js'
import {
  buildCubicleReportRows,
  CUBICLE_REPORT_SCOPE,
  filterTasksForCubicleReportScope,
  isCubicleHomeOverdueTask,
  isOperatorHomeTask,
  isTaskActiveForHomeBuckets,
  partitionCubicleHomeTasks,
  filterCubicleHomeUrgentTodayTasks,
} from '../lib/cubicleHomeTaskBuckets.js'
import { partitionHomeTasksWithHidden } from '../lib/taskHomeHidden.js'
import {
  addHomeForceShowTask,
  fetchHomeForceShowTaskIds,
  removeHomeForceShowTask,
} from '../lib/taskHomeHiddenApi.js'

const supabase = getSupabase()

function statusTone(task, now = new Date()) {
  const d = normalizeTaskStatus(task?.durum)
  if (isCubicleHomeOverdueTask(task, now)) return 'overdue'
  if (d === TASK_STATUS.APPROVED) return 'onTime'
  if (d === TASK_STATUS.PENDING_APPROVAL || d === TASK_STATUS.RESUBMITTED) return 'waiting'
  if (d === TASK_STATUS.REJECTED) return 'cancelled'
  return 'todo'
}

export function useCubicleHomeData() {
  const { profile, personel, scopeReady } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin ? null : personel?.accessibleUnitIds || []
  const personelId = personel?.id
  const operatorMode = !hasManagementDashboardAccess(profile?.yetkiler, isSystemAdmin)

  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState([])
  const [staff, setStaff] = useState([])
  const [units, setUnits] = useState([])
  const [loadedAt, setLoadedAt] = useState(() => new Date())
  const [reportScope, setReportScope] = useState(CUBICLE_REPORT_SCOPE.TODAY)
  const [fetchError, setFetchError] = useState(null)
  const [forceShowIds, setForceShowIds] = useState(() => new Set())
  const [restoringTaskId, setRestoringTaskId] = useState(null)
  const [hidingTaskId, setHidingTaskId] = useState(null)
  const [enriching, setEnriching] = useState(false)
  const enrichGenRef = useRef(0)

  const applyEnrichment = useCallback(
    async (baseTasks, enrichGen) => {
      if (!personelId || !currentCompanyId || !operatorMode) return
      setEnriching(true)
      try {
        const { tasks: enriched } = await enrichOperatorHomeTasks(supabase, baseTasks, {
          personelId,
          companyId: currentCompanyId,
          isSystemAdmin,
        })
        if (enrichGenRef.current !== enrichGen) return

        const needsWorkEnrich = enriched.some(taskNeedsWorkActionEnrich)
        const finalTasks = needsWorkEnrich
          ? await enrichTasksWithWorkActions(supabase, enriched, personelId)
          : enriched

        if (enrichGenRef.current !== enrichGen) return
        setTasks(finalTasks)
        setLoadedAt(new Date())
      } catch (e) {
        console.warn('[useCubicleHomeData] applyEnrichment', e)
      } finally {
        if (enrichGenRef.current === enrichGen) setEnriching(false)
      }
    },
    [personelId, currentCompanyId, operatorMode, isSystemAdmin],
  )

  const load = useCallback(async () => {
    if (!scopeReady) return
    if (!personelId && operatorMode) {
      setTasks([])
      setLoading(false)
      return
    }
    setLoading(true)
    setFetchError(null)
    const enrichGen = enrichGenRef.current + 1
    enrichGenRef.current = enrichGen

    try {
      const scopePayload = {
        isSystemAdmin,
        currentCompanyId,
        accessibleUnitIds,
      }

      const forceShowPromise = operatorMode
        ? fetchHomeForceShowTaskIds(personelId).catch(() => new Set())
        : Promise.resolve(new Set())

      if (operatorMode && personelId && currentCompanyId) {
        const [baseResult, forceShow] = await Promise.all([
          fetchOperatorHomeTasksBase(supabase, {
            personelId,
            companyId: currentCompanyId,
          }),
          forceShowPromise,
        ])

        setForceShowIds(forceShow)

        if (baseResult.fetchError) {
          console.error('cubicle home tasks', baseResult.fetchError)
          setFetchError(baseResult.fetchError.message || 'Görevler yüklenemedi')
          setTasks([])
        } else {
          setTasks(baseResult.tasks)
          setLoadedAt(baseResult.loadedAt || new Date())
          setFetchError(null)
          void applyEnrichment(baseResult.tasks, enrichGen)
        }

        setLoading(false)

        if (personel?.birim_id) {
          supabase
            .from('birimler')
            .select('id,birim_adi')
            .eq('id', personel.birim_id)
            .maybeSingle()
            .then(({ data }) => {
              if (enrichGenRef.current !== enrichGen) return
              setStaff([])
              setUnits(data?.id ? [data] : [])
            })
            .catch(() => {})
        } else {
          setStaff([])
          setUnits([])
        }
        return
      }

      const tasksPromise = loadCubicleHomeTasks(supabase, {
        scope: scopePayload,
        scopeIslerQuery,
        operatorMode,
        personelId,
        currentCompanyId,
        isSystemAdmin,
      })

      const metaPromise = enrichScopeWithJunctionPersonelIds(supabase, scopePayload).then(
        (scope) =>
          Promise.all([
            scopePersonelQuery(supabase, scope, 'id,ad,soyad,email,birim_id').is(
              'silindi_at',
              null,
            ),
            supabase.from('birimler').select('id,birim_adi').is('silindi_at', null),
          ]),
      )

      const [tasksResult, metaResult, forceShow] = await Promise.all([
        tasksPromise,
        metaPromise,
        forceShowPromise,
      ])

      if (tasksResult.fetchError) {
        console.error('cubicle home tasks', tasksResult.fetchError)
        setFetchError(tasksResult.fetchError.message || 'Görevler yüklenemedi')
      }

      const now = new Date()
      const timeVisible = tasksResult.tasks.filter((t) => isTaskVisibleNow(t, now))

      setTasks(timeVisible)
      setLoadedAt(new Date())
      setLoading(false)

      const [staffRes, unitRes] = metaResult || []
      setStaff(staffRes?.data || [])
      setUnits(unitRes?.data || [])

      if (personelId && timeVisible.some(taskNeedsWorkActionEnrich)) {
        enrichTasksWithWorkActions(supabase, timeVisible, personelId)
          .then((withActions) => {
            if (enrichGenRef.current !== enrichGen) return
            setTasks(withActions)
          })
          .catch((e) => {
            console.warn('[useCubicleHomeData] enrichTasksWithWorkActions', e)
          })
      }
    } catch (e) {
      console.error('[useCubicleHomeData] load', e)
      setFetchError(e?.message || 'Yüklenemedi')
      setLoading(false)
    }
  }, [
    scopeReady,
    isSystemAdmin,
    currentCompanyId,
    JSON.stringify(accessibleUnitIds),
    personelId,
    operatorMode,
    personel?.birim_id,
    applyEnrichment,
  ])

  useEffect(() => {
    load()
  }, [load])

  const staffMap = useMemo(() => {
    const m = new Map()
    for (const s of staff) {
      const name = [s.ad, s.soyad].filter(Boolean).join(' ') || s.email || String(s.id)
      m.set(String(s.id), name)
    }
    return m
  }, [staff])

  const unitMap = useMemo(() => {
    const m = new Map()
    for (const u of units) m.set(String(u.id), u.birim_adi || '')
    return m
  }, [units])

  const enriched = useMemo(
    () =>
      tasks.map((t) => ({
        ...t,
        projectLabel:
          t.is_sablonlari?.baslik || unitMap.get(String(t.birim_id)) || 'Görev',
        assigneeName: staffMap.get(String(t.sorumlu_personel_id)) || '—',
        tone: statusTone(t, loadedAt),
        statusLabel: normalizeTaskStatus(t.durum) || 'Bekliyor',
      })),
    [tasks, staffMap, unitMap, loadedAt],
  )

  const activeTasks = useMemo(
    () => enriched.filter((t) => isTaskActiveForHomeBuckets(t, loadedAt)),
    [enriched, loadedAt],
  )

  const { hiddenOverdue, visibleForBuckets } = useMemo(() => {
    if (!operatorMode) {
      return { hiddenOverdue: [], visibleForBuckets: activeTasks }
    }
    const { hidden, visiblePool } = partitionHomeTasksWithHidden(
      activeTasks,
      loadedAt,
      forceShowIds,
    )
    return { hiddenOverdue: hidden, visibleForBuckets: visiblePool }
  }, [activeTasks, loadedAt, forceShowIds, operatorMode])

  const { overdue, today, tomorrow } = useMemo(
    () => partitionCubicleHomeTasks(visibleForBuckets, loadedAt),
    [visibleForBuckets, loadedAt],
  )

  const urgentToday = useMemo(() => {
    if (!operatorMode) return []
    return filterCubicleHomeUrgentTodayTasks(visibleForBuckets, loadedAt, personelId)
  }, [visibleForBuckets, loadedAt, personelId, operatorMode])

  const assignedToMe = useMemo(() => {
    if (!personelId) return []
    return visibleForBuckets
      .filter((t) => isOperatorHomeTask(t, personelId))
      .sort((a, b) => {
        const da = a.son_tarih ? new Date(a.son_tarih).getTime() : 0
        const db = b.son_tarih ? new Date(b.son_tarih).getTime() : 0
        return da - db
      })
  }, [visibleForBuckets, personelId])

  const restoreHiddenToHome = useCallback(
    async (task) => {
      if (!personelId || !task?.id) return
      setRestoringTaskId(task.id)
      try {
        await addHomeForceShowTask(personelId, task.id)
        setForceShowIds((prev) => {
          const next = new Set(prev)
          next.add(String(task.id))
          return next
        })
      } finally {
        setRestoringTaskId(null)
      }
    },
    [personelId],
  )

  const hideFromHome = useCallback(
    async (task) => {
      if (!personelId || !task?.id) return
      setHidingTaskId(task.id)
      try {
        await removeHomeForceShowTask(personelId, task.id)
        setForceShowIds((prev) => {
          const next = new Set(prev)
          next.delete(String(task.id))
          return next
        })
      } finally {
        setHidingTaskId(null)
      }
    },
    [personelId],
  )

  const reportRows = useMemo(() => {
    const scoped = filterTasksForCubicleReportScope(enriched, reportScope, loadedAt)
    return buildCubicleReportRows(scoped, loadedAt)
  }, [enriched, reportScope, loadedAt])

  const reportTotal = useMemo(() => {
    return filterTasksForCubicleReportScope(enriched, reportScope, loadedAt).length
  }, [enriched, reportScope, loadedAt])

  return {
    loading,
    enriching,
    reload: load,
    fetchError,
    overdue,
    today,
    tomorrow,
    urgentToday,
    urgentTodayCount: urgentToday.length,
    assignedToMe,
    reportRows,
    reportScope,
    setReportScope,
    reportTotal,
    totalTasks: visibleForBuckets.length,
    hiddenOverdue,
    hiddenCount: hiddenOverdue.length,
    restoreHiddenToHome,
    restoringTaskId,
    hideFromHome,
    hidingTaskId,
    forceShowIds,
    operatorMode,
    loadedAt,
  }
}
