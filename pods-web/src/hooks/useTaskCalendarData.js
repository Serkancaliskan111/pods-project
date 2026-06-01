import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import getSupabase from '../lib/supabaseClient'
import { AuthContext } from '../contexts/AuthContext.jsx'
import { hasManagementDashboardAccess } from '../lib/permissions.js'
import { isTaskAssignedToPersonel } from '../lib/taskWorkEligibility.js'
import { isTaskVisibleNow, isTaskVisibleToPerson } from '../lib/taskVisibility.js'
import { fetchOperatorAssigneeTasks } from '../lib/loadCubicleHomeTasks.js'
import {
  enrichScopeForTasks,
  loadTasksListData,
  JOBS_SELECT_WITH_VISIBLE_AT,
  JOBS_SELECT_LEGACY,
} from '../pages/admin/tasks/lib/tasksListLoadUtils.js'
import {
  CALENDAR_FILTER,
  resolveCalendarRange,
  taskOverlapsRange,
} from '../lib/taskCalendarUtils.js'

const supabase = getSupabase()

function staffToMap(rows) {
  const m = {}
  for (const r of rows || []) {
    if (r?.id) m[String(r.id)] = r
  }
  return m
}

export function useTaskCalendarData({ viewMode, anchorDate, taskFilter }) {
  const { profile, personel, scopeReady } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const permissions = profile?.yetkiler || {}
  const canManageTeam = hasManagementDashboardAccess(permissions, isSystemAdmin)
  const personelId = personel?.id ? String(personel.id) : ''
  const companyId = personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin ? null : personel?.accessibleUnitIds

  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState([])
  const [staff, setStaff] = useState([])

  const range = useMemo(
    () => resolveCalendarRange(viewMode, anchorDate),
    [viewMode, anchorDate],
  )

  const load = useCallback(async () => {
    if (!scopeReady || !personelId) {
      setTasks([])
      setStaff([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const scope = canManageTeam
        ? await enrichScopeForTasks(supabase, {
            isSystemAdmin,
            currentCompanyId: companyId,
            accessibleUnitIds,
          })
        : { isSystemAdmin, currentCompanyId: companyId, accessibleUnitIds }

      const [scopeResult, mineResult] = await Promise.all([
        canManageTeam
          ? loadTasksListData({
              supabase,
              scope,
              personel,
              isSystemAdmin,
              currentCompanyId: companyId,
              operatorMode: false,
            })
          : Promise.resolve({ tasks: [], staff: [], error: null }),
        fetchOperatorAssigneeTasks(supabase, {
          personelId,
          companyId,
          limit: 500,
          select: JOBS_SELECT_WITH_VISIBLE_AT,
          selectLegacy: JOBS_SELECT_LEGACY,
        }),
      ])

      if (scopeResult.error) {
        console.error(scopeResult.error)
        toast.error('Takvim görevleri yüklenemedi')
      }

      const merged = new Map()
      for (const t of scopeResult.tasks || []) {
        if (t?.id && isTaskVisibleNow(t) && isTaskVisibleToPerson(t, personelId)) {
          merged.set(String(t.id), t)
        }
      }
      for (const t of mineResult.data || []) {
        if (t?.id && isTaskVisibleNow(t) && isTaskVisibleToPerson(t, personelId)) {
          merged.set(String(t.id), t)
        }
      }

      setTasks([...merged.values()])
      setStaff(scopeResult.staff || [])
    } catch (e) {
      console.warn('[useTaskCalendarData]', e)
      setTasks([])
      setStaff([])
    } finally {
      setLoading(false)
    }
  }, [
    scopeReady,
    personelId,
    companyId,
    canManageTeam,
    isSystemAdmin,
    accessibleUnitIds,
    personel,
  ])

  useEffect(() => {
    void load()
  }, [load])

  const staffMap = useMemo(() => staffToMap(staff), [staff])

  const tasksInRange = useMemo(() => {
    return tasks.filter((t) => taskOverlapsRange(t, range.start, range.end))
  }, [tasks, range.start, range.end])

  const filteredTasks = useMemo(() => {
    const effectiveFilter =
      taskFilter === CALENDAR_FILTER.TEAM && canManageTeam
        ? CALENDAR_FILTER.TEAM
        : CALENDAR_FILTER.MINE

    if (effectiveFilter === CALENDAR_FILTER.MINE) {
      return tasksInRange.filter((t) => isTaskAssignedToPersonel(t, personelId))
    }
    return tasksInRange.filter(
      (t) =>
        t?.sorumlu_personel_id &&
        !isTaskAssignedToPersonel(t, personelId),
    )
  }, [tasksInRange, taskFilter, canManageTeam, personelId])

  return {
    loading,
    reload: load,
    range,
    filteredTasks,
    staffMap,
    canManageTeam,
    taskCount: filteredTasks.length,
  }
}
