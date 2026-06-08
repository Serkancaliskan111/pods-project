import {
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
} from './taskStatus.js'
import {
  isListedTaskVisibleForAssignee,
  isTaskVisibleAtInLocalCalendarDay,
  isTaskVisibleNow,
} from './taskVisibility.js'
import {
  getTaskScheduleDate,
  isUrgentTask,
} from '../pages/admin/tasks/lib/tasksListGrouping.js'

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

export function getTaskDueDate(task) {
  const raw = task?.son_tarih
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Mobil ana sayfa KPI ile uyum: bugün oluşturulan / atanan iş */
export function isTaskCreatedOnLocalCalendarDay(task, now = new Date()) {
  const raw = task?.created_at
  if (!raw) return false
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() >= startOfDay(now).getTime() && d.getTime() <= endOfDay(now).getTime()
}

/** Ana sayfa listelerinde gösterilmeye devam eden (onaylı / kapalı olmayan) işler */
export function isTaskActiveForHomeBuckets(task, now = new Date()) {
  if (isApprovedTaskStatus(task?.durum)) return false
  return true
}

/**
 * Süresi geçmiş: son_tarih şu andan önce; onay bekliyor ama süre içinde teslim edildiyse gecikmiş sayılmaz.
 */
export function isCubicleHomeOverdueTask(task, now = new Date()) {
  if (!isTaskActiveForHomeBuckets(task, now)) return false
  const due = getTaskDueDate(task)
  if (!due) return false
  if (due.getTime() >= now.getTime()) return false
  if (isPendingApprovalTaskStatus(task?.durum)) {
    const done = new Date(task.updated_at || task.created_at || 0)
    if (!Number.isNaN(done.getTime()) && done.getTime() <= due.getTime()) return false
  }
  return true
}

/**
 * Bugün: bugün atanan, bugün vadesi (gecikmemiş) veya bugün görünür başlayan işler.
 */
export function isCubicleHomeTodayTask(task, now = new Date()) {
  if (!isTaskActiveForHomeBuckets(task, now)) return false
  if (isCubicleHomeOverdueTask(task, now)) return false

  if (isTaskCreatedOnLocalCalendarDay(task, now)) return true

  const due = getTaskDueDate(task)
  if (due) {
    if (due.getTime() >= startOfDay(now).getTime() && due.getTime() <= endOfDay(now).getTime()) {
      return true
    }
    return isTaskVisibleAtInLocalCalendarDay(task, now)
  }

  return isTaskVisibleAtInLocalCalendarDay(task, now)
}

/**
 * Yarın: vadesi veya görünürlük başlangıcı yarın; gecikmiş/bugün kovalarında değil.
 */
export function isCubicleHomeTomorrowTask(task, now = new Date()) {
  if (!isTaskActiveForHomeBuckets(task, now)) return false
  if (isCubicleHomeOverdueTask(task, now)) return false
  if (isCubicleHomeTodayTask(task, now)) return false

  const tomorrowStart = startOfDay(addDays(now, 1))
  const tomorrowEnd = endOfDay(addDays(now, 1))

  const due = getTaskDueDate(task)
  if (due && due.getTime() >= tomorrowStart.getTime() && due.getTime() <= tomorrowEnd.getTime()) {
    return true
  }

  const visibleAt = task?.baslama_tarihi || task?.gorunur_tarih
  if (!visibleAt) return false
  const d = new Date(visibleAt)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() >= tomorrowStart.getTime() && d.getTime() <= tomorrowEnd.getTime()
}

export function sortTasksByDueAsc(a, b) {
  const da = getTaskDueDate(a)?.getTime() ?? getTaskScheduleDate(a)?.getTime() ?? 0
  const db = getTaskDueDate(b)?.getTime() ?? getTaskScheduleDate(b)?.getTime() ?? 0
  return da - db
}

/** Gecikmiş + Bugün listelerine girebilecek görünür işler */
export function filterTasksForCubicleHomeBuckets(tasks, now = new Date(), { operatorMode = false } = {}) {
  return (tasks || []).filter((t) => {
    if (operatorMode) {
      return (
        isListedTaskVisibleForAssignee(t, now) ||
        isTaskCreatedOnLocalCalendarDay(t, now) ||
        isCubicleHomeOverdueTask(t, now)
      )
    }
    return isTaskVisibleNow(t, now)
  })
}

export function partitionCubicleHomeTasks(tasks, now = new Date()) {
  const overdue = (tasks || []).filter((t) => isCubicleHomeOverdueTask(t, now)).sort(sortTasksByDueAsc)
  const today = (tasks || []).filter((t) => isCubicleHomeTodayTask(t, now)).sort(sortTasksByDueAsc)
  const tomorrow = (tasks || []).filter((t) => isCubicleHomeTomorrowTask(t, now)).sort(sortTasksByDueAsc)
  return { overdue, today, tomorrow }
}

/**
 * Ana sayfa acil paneli — son 7 gün (bugün dahil) ile ilişkili mi?
 * Oluşturma, güncelleme veya son tarih bu aralıkta değilse gösterilmez.
 */
export function isCubicleHomeUrgentWithinLastWeek(task, now = new Date()) {
  const rangeEnd = endOfDay(now)
  const rangeStart = startOfDay(addDays(now, -6))

  const inRange = (raw) => {
    if (!raw) return false
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return false
    return d.getTime() >= rangeStart.getTime() && d.getTime() <= rangeEnd.getTime()
  }

  if (inRange(task?.created_at)) return true
  if (inRange(task?.updated_at)) return true

  const due = getTaskDueDate(task)
  if (due) {
    const dueMs = due.getTime()
    if (dueMs >= rangeStart.getTime() && dueMs <= rangeEnd.getTime()) return true
  }

  if (inRange(task?.baslama_tarihi)) return true
  if (inRange(task?.gorunur_tarih)) return true

  return false
}

/**
 * Ana sayfa acil görev: acil bayrağı + aktif + son 7 gün + (personelId verilirse kendi işleri).
 */
export function isCubicleHomeUrgentTodayTask(task, now = new Date(), personelId = null) {
  if (!isUrgentTask(task)) return false
  if (!isTaskActiveForHomeBuckets(task, now)) return false
  if (personelId && !isOperatorHomeTask(task, personelId)) return false
  if (!isCubicleHomeUrgentWithinLastWeek(task, now)) return false
  return true
}

export function filterCubicleHomeUrgentTodayTasks(tasks, now = new Date(), personelId = null) {
  return (tasks || [])
    .filter((t) => isCubicleHomeUrgentTodayTask(t, now, personelId))
    .sort((a, b) => {
      const aOver = isCubicleHomeOverdueTask(a, now) ? 0 : 1
      const bOver = isCubicleHomeOverdueTask(b, now) ? 0 : 1
      if (aOver !== bOver) return aOver - bOver
      const aCreated = new Date(a.created_at || 0).getTime()
      const bCreated = new Date(b.created_at || 0).getTime()
      if (aCreated !== bCreated) return bCreated - aCreated
      return sortTasksByDueAsc(a, b)
    })
}

const URGENT_HOME_TIMELINE_DAYS = 7

function parseTaskInstant(raw) {
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Çizelgede konumlandırılacak an: önce son tarih, yoksa başlangıç / görünürlük / oluşturma. */
export function getUrgentTaskTimelineInstant(task) {
  return (
    getTaskDueDate(task) ||
    parseTaskInstant(task?.baslama_tarihi) ||
    parseTaskInstant(task?.gorunur_tarih) ||
    parseTaskInstant(task?.created_at)
  )
}

export function getUrgentTimelineRange(now = new Date()) {
  return {
    start: startOfDay(addDays(now, -(URGENT_HOME_TIMELINE_DAYS - 1))),
    end: endOfDay(now),
  }
}

/** Son 7 gün ekseninde 0–100 konum (sol = eski, sağ = bugün). */
export function urgentTaskTimelineProgress(task, now = new Date()) {
  const instant = getUrgentTaskTimelineInstant(task)
  if (!instant) return 50
  const { start, end } = getUrgentTimelineRange(now)
  const rangeStart = start.getTime()
  const rangeEnd = end.getTime()
  const span = rangeEnd - rangeStart
  if (span <= 0) return 50
  const pct = ((instant.getTime() - rangeStart) / span) * 100
  return Math.min(100, Math.max(0, pct))
}

/** Liste satırında gösterilecek saat / tarih etiketi. */
export function formatUrgentTaskTimelineLabel(task, now = new Date()) {
  const instant = getUrgentTaskTimelineInstant(task)
  if (!instant) return '—'
  const ms = instant.getTime()
  const todayStart = startOfDay(now).getTime()
  const todayEnd = endOfDay(now).getTime()

  if (ms >= todayStart && ms <= todayEnd) {
    return instant.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  }

  return instant.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Çizelge alt ekseni — son 7 gün. */
export function getUrgentTimelineAxisLabels(now = new Date()) {
  const shortDay = (d) =>
    d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' })
  return [
    { key: 'start', label: shortDay(addDays(now, -(URGENT_HOME_TIMELINE_DAYS - 1))) },
    { key: 'mid', label: shortDay(addDays(now, -3)) },
    { key: 'end', label: 'Bugün' },
  ]
}

/** Aynı konuma düşen noktaları dikey sıraya ayırır. */
export function spreadUrgentTimelineLanes(entries, minGapPct = 2.5) {
  const sorted = [...entries].sort((a, b) => a.progress - b.progress)
  const lanes = []
  for (const item of sorted) {
    let lane = 0
    while (
      lanes.some(
        (prev) => prev.lane === lane && Math.abs(prev.progress - item.progress) < minGapPct,
      )
    ) {
      lane += 1
    }
    lanes.push({ ...item, lane })
  }
  return lanes
}

export const CUBICLE_REPORT_SCOPE = {
  TODAY: 'today',
  WEEK: 'week',
  ALL: 'all',
}

/** Raporlar paneli: seçilen zaman aralığına göre görev alt kümesi */
export function filterTasksForCubicleReportScope(tasks, scope, now = new Date()) {
  const list = tasks || []
  if (scope === CUBICLE_REPORT_SCOPE.ALL) return list
  if (scope === CUBICLE_REPORT_SCOPE.TODAY) {
    return list.filter(
      (t) =>
        isCubicleHomeTodayTask(t, now) ||
        isCubicleHomeOverdueTask(t, now) ||
        isTaskCreatedOnLocalCalendarDay(t, now),
    )
  }
  if (scope === CUBICLE_REPORT_SCOPE.WEEK) {
    const weekStart = startOfDay(addDays(now, -6))
    const weekEnd = endOfDay(now)
    return list.filter((t) => {
      const raw = t?.created_at || t?.updated_at
      if (!raw) return false
      const d = new Date(raw)
      if (Number.isNaN(d.getTime())) return false
      return d.getTime() >= weekStart.getTime() && d.getTime() <= weekEnd.getTime()
    })
  }
  return list
}

export function buildCubicleReportRows(tasks, now = new Date()) {
  const counts = { todo: 0, onTime: 0, overdue: 0, waiting: 0, cancelled: 0 }
  for (const t of tasks || []) {
    const tone = t.tone || inferReportTone(t, now)
    if (tone === 'onTime') counts.onTime++
    else if (tone === 'overdue') counts.overdue++
    else if (tone === 'waiting') counts.waiting++
    else if (tone === 'cancelled') counts.cancelled++
    else counts.todo++
  }
  const total = (tasks || []).length
  const denom = total > 0 ? total : 1
  return [
    { key: 'todo', label: 'Yapılacak', color: '#5B8DEF', count: counts.todo, pct: counts.todo / denom },
    { key: 'onTime', label: 'Zamanında', color: '#3CB878', count: counts.onTime, pct: counts.onTime / denom },
    { key: 'overdue', label: 'Gecikmiş', color: '#E53935', count: counts.overdue, pct: counts.overdue / denom },
    { key: 'waiting', label: 'Onay Bekliyor', color: '#EC4899', count: counts.waiting, pct: counts.waiting / denom },
    { key: 'cancelled', label: 'Reddedildi', color: '#9CA3AF', count: counts.cancelled, pct: counts.cancelled / denom },
  ]
}

function inferReportTone(task, now) {
  if (isApprovedTaskStatus(task?.durum)) return 'onTime'
  if (isCubicleHomeOverdueTask(task, now)) return 'overdue'
  const d = String(task?.durum || '').toLowerCase()
  if (d.includes('onay') || d.includes('bekl')) return 'waiting'
  if (d.includes('red')) return 'cancelled'
  return 'todo'
}

import { isProjectPlanningTask } from './projectTaskGlobalList.js'
import { isProjectTaskAssignedToPersonel } from './projectTaskPlan.js'

export function isOperatorHomeTask(task, personelId) {
  const pid = String(personelId || '')
  if (!pid) return false
  if (isProjectPlanningTask(task) && isProjectTaskAssignedToPersonel(task, personelId)) return true
  if (String(task?.sorumlu_personel_id || '') === pid) return true
  if (task?.workAction?.show) return true
  return false
}
