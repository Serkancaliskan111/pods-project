import { isApprovedTaskStatus } from '../../../../lib/taskStatus.js'
import { isProjectTaskAssignedToPersonel } from '../../../../lib/projectTaskPlan.js'

export function startOfDay(d = new Date()) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function endOfDay(d = new Date()) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function addDays(d, days) {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

export function getTaskScheduleDate(task) {
  const raw = task?.son_tarih || task?.baslama_tarihi || task?.gorunur_tarih
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Tamamlanan görevler — onay / güncelleme zamanı */
export function getTaskCompletionDate(task) {
  const raw = task?.updated_at || task?.son_tarih || task?.created_at
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Onay bekleyenler: onaya gönderilme (en eski üstte) */
export function sortAuditPendingTasksOldestFirst(tasks) {
  return [...tasks].sort((a, b) => {
    const da = getTaskCompletionDate(a)?.getTime()
    const db = getTaskCompletionDate(b)?.getTime()
    if (da != null && db != null && da !== db) return da - db
    if (da != null && db == null) return -1
    if (da == null && db != null) return 1
    const ca = new Date(a?.created_at || 0).getTime() || 0
    const cb = new Date(b?.created_at || 0).getTime() || 0
    if (ca !== cb) return ca - cb
    return String(a?.id || '').localeCompare(String(b?.id || ''))
  })
}

export function isUrgentTask(task) {
  return task?.acil === true || task?.acil === 1
}

export function matchesQuickFilter(task, quickFilter, personelId) {
  if (!quickFilter || quickFilter === 'all') return true
  const pid = String(personelId || '')
  if (quickFilter === 'assigned_by_me') {
    return String(task?.atayan_personel_id || '') === pid
  }
  if (quickFilter === 'assigned_to_me') {
    if (task?._isGrouped && Array.isArray(task?._groupAssigneeIds)) {
      return task._groupAssigneeIds.some((id) => String(id) === pid)
    }
    if (task?._projectPlanning) return isProjectTaskAssignedToPersonel(task, pid)
    return String(task?.sorumlu_personel_id || '') === pid
  }
  if (quickFilter === 'urgent') return isUrgentTask(task)
  return true
}

/** Görev atama yetkisi yoksa "Benim atadığım" hızlı filtresini gizle. */
export function filterQuickFiltersForAssignPermission(quickFilters, canAssignTask) {
  if (canAssignTask) return quickFilters || []
  return (quickFilters || []).filter((f) => f.id !== 'assigned_by_me')
}

export function normalizeQuickFilterForAssignPermission(quickFilter, canAssignTask, fallback = 'all') {
  if (canAssignTask || quickFilter !== 'assigned_by_me') {
    return quickFilter || fallback
  }
  return fallback
}

export function filterByListMode(task, listMode) {
  const approved = isApprovedTaskStatus(task?.durum)
  if (listMode === 'completed') return approved
  if (listMode === 'pending') return !approved
  return true
}

/** Bekleyen görevler: Bugün (gecikmiş dahil), Yarın, 7 gün */
export function groupPendingByTime(tasks, now = new Date()) {
  const todayEnd = endOfDay(now)
  const tomorrowStart = startOfDay(addDays(now, 1))
  const tomorrowEnd = endOfDay(addDays(now, 1))
  const weekEnd = endOfDay(addDays(now, 7))

  const today = []
  const tomorrow = []
  const week = []
  const other = []

  for (const t of tasks) {
    const due = getTaskScheduleDate(t)
    if (!due) {
      other.push(t)
      continue
    }
    if (due <= todayEnd) {
      today.push(t)
    } else if (due >= tomorrowStart && due <= tomorrowEnd) {
      tomorrow.push(t)
    } else if (due > tomorrowEnd && due <= weekEnd) {
      week.push(t)
    } else {
      other.push(t)
    }
  }

  const byDue = (a, b) => {
    const da = getTaskScheduleDate(a)?.getTime() ?? 0
    const db = getTaskScheduleDate(b)?.getTime() ?? 0
    return da - db
  }

  today.sort(byDue)
  tomorrow.sort(byDue)
  week.sort(byDue)
  other.sort(byDue)

  return { today, tomorrow, week, other }
}

/** Tamamlanan görevler: Bugün, Dün, Son 7 gün (bugün/dün dışındakiler) */
export function groupCompletedByTime(tasks, now = new Date()) {
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const yesterdayStart = startOfDay(addDays(now, -1))
  const yesterdayEnd = endOfDay(addDays(now, -1))

  const today = []
  const yesterday = []
  const last7Days = []

  for (const t of tasks) {
    const completed = getTaskCompletionDate(t)
    if (!completed) {
      last7Days.push(t)
      continue
    }
    const time = completed.getTime()
    if (time >= todayStart.getTime() && time <= todayEnd.getTime()) {
      today.push(t)
    } else if (time >= yesterdayStart.getTime() && time <= yesterdayEnd.getTime()) {
      yesterday.push(t)
    } else {
      last7Days.push(t)
    }
  }

  const byCompletedDesc = (a, b) => {
    const da = getTaskCompletionDate(a)?.getTime() ?? 0
    const db = getTaskCompletionDate(b)?.getTime() ?? 0
    return db - da
  }

  today.sort(byCompletedDesc)
  yesterday.sort(byCompletedDesc)
  last7Days.sort(byCompletedDesc)

  return { today, yesterday, last7Days }
}
