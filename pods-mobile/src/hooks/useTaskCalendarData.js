import { useCallback, useEffect, useMemo, useState } from 'react'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { hasManagementDashboardAccess } from '../lib/permissions'
import { isTaskAssignedToPersonel } from '../lib/taskWorkEligibility'
import { isTaskVisibleNow, isTaskVisibleToPerson } from '../lib/taskVisibility'
import { fetchOperatorAssigneeTasks } from '../lib/loadCubicleHomeTasks'
import {
  enrichScopeForTasks,
  loadTasksListData,
  JOBS_SELECT_WITH_VISIBLE_AT,
  JOBS_SELECT_LEGACY,
} from '../screens/admin/tasks/lib/tasksListLoadUtils'
import {
  CALENDAR_FILTER,
  resolveCalendarRange,
  taskOverlapsRange,
} from '../lib/taskCalendarUtils'
import {
  buildCalendarTeamMemberOptions,
  fetchRolePermissionsMap,
  taskMatchesTeamPersonelSelection,
} from '../lib/calendarTeamMembers'

const supabase = getSupabase()

function staffToMap(rows) {
  const m = {}
  for (const r of rows || []) {
    if (r?.id) m[String(r.id)] = r
  }
  return m
}

export function useTaskCalendarData({ viewMode, anchorDate, taskFilter, selectedTeamPersonelIds = [] }) {
  const { profile, personel, scopeReady, permissions } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const canManageTeam = hasManagementDashboardAccess(permissions, isSystemAdmin)
  const personelId = personel?.id ? String(personel.id) : ''
  const companyId = personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin ? null : personel?.accessibleUnitIds

  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState([])
  const [staff, setStaff] = useState([])
  const [rolePermMap, setRolePermMap] = useState({})

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

      const staffRows = scopeResult.staff || []
      setTasks([...merged.values()])
      setStaff(staffRows)
      if (canManageTeam && staffRows.length) {
        const map = await fetchRolePermissionsMap(
          supabase,
          staffRows.map((r) => r.rol_id),
        )
        setRolePermMap(map)
      } else {
        setRolePermMap({})
      }
    } catch (e) {
      if (__DEV__) console.warn('[useTaskCalendarData]', e)
      setTasks([])
      setStaff([])
      setRolePermMap({})
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

  const teamMemberOptions = useMemo(() => {
    if (!canManageTeam) return []
    return buildCalendarTeamMemberOptions(staff, {
      assigner: personel,
      assignerPermissions: permissions,
      accessibleUnitIds,
      isSystemAdmin,
      rolePermMap,
    })
  }, [canManageTeam, staff, personel, permissions, accessibleUnitIds, isSystemAdmin, rolePermMap])

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
    if (!selectedTeamPersonelIds?.length) return []
    return tasksInRange.filter((t) =>
      taskMatchesTeamPersonelSelection(t, selectedTeamPersonelIds),
    )
  }, [tasksInRange, taskFilter, canManageTeam, personelId, selectedTeamPersonelIds])

  return {
    loading,
    reload: load,
    range,
    filteredTasks,
    staffMap,
    teamMemberOptions,
    canManageTeam,
    taskCount: filteredTasks.length,
    teamSelectionRequired:
      taskFilter === CALENDAR_FILTER.TEAM &&
      canManageTeam &&
      !selectedTeamPersonelIds?.length,
  }
}
