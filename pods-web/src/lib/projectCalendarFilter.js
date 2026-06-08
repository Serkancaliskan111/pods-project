import { isTaskAssignedToPersonel } from './taskWorkEligibility.js'
import { CALENDAR_FILTER, buildGanttRows, taskOverlapsRange } from './taskCalendarUtils.js'
import {
  buildProjectGanttTeamRows,
} from './projectGanttUtils.js'
import { personRowDisplayName, sortPersonRowsAlphabeticalTr } from './calendarTeamMembers.js'

export function buildProjectTeamPickerOptions(teamMembers = []) {
  return sortPersonRowsAlphabeticalTr(
    (teamMembers || [])
      .filter((m) => m?.personel_id)
      .map((m) => ({ ...m, id: String(m.personel_id) })),
  )
}

export function projectTaskMatchesTeamSelection(task, selectedPersonelIds) {
  const ids = (selectedPersonelIds || []).map(String).filter(Boolean)
  if (!ids.length) return false
  return ids.some((id) => isTaskAssignedToPersonel(task, id))
}

export function filterActiveProjectTasks(tasks) {
  return (tasks || []).filter((t) => !t.silindi_at)
}

export function filterProjectTasksInRange(tasks, rangeStart, rangeEnd) {
  return filterActiveProjectTasks(tasks).filter((t) =>
    taskOverlapsRange(t, rangeStart, rangeEnd),
  )
}

/**
 * @param {'mine'|'team'|'all'} taskFilter
 */
export function filterProjectTasksForCalendar(
  tasks,
  taskFilter,
  { personelId, selectedTeamPersonelIds = [], canUseTeamFilter = false } = {},
) {
  const active = filterActiveProjectTasks(tasks)
  const pid = String(personelId || '')

  if (taskFilter === CALENDAR_FILTER.TEAM && canUseTeamFilter) {
    if (!selectedTeamPersonelIds?.length) return []
    return active.filter((t) => projectTaskMatchesTeamSelection(t, selectedTeamPersonelIds))
  }

  if (taskFilter === CALENDAR_FILTER.ALL) {
    return active
  }

  if (!pid) return []
  return active.filter((t) => isTaskAssignedToPersonel(t, pid))
}

export function buildProjectCalendarGanttRows(
  filteredTasks,
  taskFilter,
  { personelId, personMap, teamMembers, selectedTeamPersonelIds, canUseTeamFilter } = {},
) {
  if (taskFilter === CALENDAR_FILTER.TEAM && canUseTeamFilter) {
    return buildProjectGanttTeamRows(filteredTasks, teamMembers, personMap, {
      onlyMemberIds: (selectedTeamPersonelIds || []).map(String),
    })
  }
  if (taskFilter === CALENDAR_FILTER.ALL) {
    return buildProjectGanttTeamRows(filteredTasks, teamMembers, personMap)
  }
  return buildGanttRows(filteredTasks, CALENDAR_FILTER.MINE, personelId, personMap)
}

export { personRowDisplayName }
