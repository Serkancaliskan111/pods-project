import { useEffect, useMemo, useState } from 'react'
import {
  filterProjectByListMode,
  getProjectAssigneeName,
  getProjectTaskTypeLabel,
  mapProjectTasksForPodsUI,
  matchesProjectQuickFilter,
} from '../lib/projectTaskPodsAdapter.js'
import {
  groupCompletedByTime,
  groupPendingByTime,
} from '../pages/admin/tasks/lib/tasksListGrouping.js'

export function useProjectTasksListPage({
  tasks = [],
  listMode = 'pending',
  personelId,
  personMap = {},
  projectLabel = 'Proje',
  initialQuickFilter,
}) {
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState(
    initialQuickFilter || (listMode === 'pending' ? 'all' : 'assigned_to_me'),
  )

  useEffect(() => {
    if (initialQuickFilter) setQuickFilter(initialQuickFilter)
  }, [initialQuickFilter])

  const mapped = useMemo(() => mapProjectTasksForPodsUI(tasks), [tasks])

  const filtered = useMemo(() => {
    let list = mapped.filter((t) => filterProjectByListMode(t, listMode))
    list = list.filter((t) => matchesProjectQuickFilter(t, quickFilter, personelId))
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((t) => {
        const assignee = getProjectAssigneeName(t, personMap).toLowerCase()
        return (
          String(t.baslik || '')
            .toLowerCase()
            .includes(q) ||
          String(t.aciklama || '')
            .toLowerCase()
            .includes(q) ||
          assignee.includes(q)
        )
      })
    }
    return list
  }, [mapped, listMode, quickFilter, personelId, search, personMap])

  const pendingGroups = useMemo(
    () => (listMode === 'pending' ? groupPendingByTime(filtered) : null),
    [filtered, listMode],
  )

  const completedGroups = useMemo(
    () => (listMode === 'completed' ? groupCompletedByTime(filtered) : null),
    [filtered, listMode],
  )

  const getCompanyName = () => projectLabel
  const getStaffName = (id) => getProjectAssigneeName({ sorumlu_personel_id: id }, personMap)
  const getTaskTypeLabel = (type) => getProjectTaskTypeLabel(type)

  return {
    loading: false,
    search,
    setSearch,
    quickFilter,
    setQuickFilter,
    filteredTasks: filtered,
    pendingGroups,
    completedGroups,
    getCompanyName,
    getStaffName,
    getTaskTypeLabel,
    personel: { id: personelId },
  }
}
