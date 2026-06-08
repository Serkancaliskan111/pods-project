import { PROJECT_TASK_STATUS_OPTIONS } from './projectStatus.js'
import {
  computeProjectProgress,
  getProjectSpan,
  isProjectTaskOverdue,
  parseProjectDate,
} from './projectGanttUtils.js'
import { endOfDay, startOfDay } from './taskCalendarUtils.js'

const MS_DAY = 24 * 60 * 60 * 1000

function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Proje detay özet paneli için mantıksal metrikler */
export function buildProjectSummary(project, tasks = []) {
  const active = (tasks || []).filter((t) => !t.silindi_at)
  const progress = computeProjectProgress(active)

  const byStatus = Object.fromEntries(
    PROJECT_TASK_STATUS_OPTIONS.map((o) => [o.value, 0]),
  )
  for (const t of active) {
    const key = t.durum || 'yapilacak'
    if (byStatus[key] !== undefined) byStatus[key] += 1
    else byStatus.yapilacak += 1
  }

  const operationalLinked = active.filter((t) => t.bagli_is_id).length
  const operationalPending = active.filter(
    (t) => !t.bagli_is_id && t.durum !== 'tamamlandi',
  ).length

  const overdueTasks = active.filter((t) => isProjectTaskOverdue(t))
  const today = startOfDay(new Date())
  const dueSoonTasks = active.filter((t) => {
    if (t.durum === 'tamamlandi') return false
    const end = parseProjectDate(t.bitis_tarihi)
    if (!end) return false
    const endDay = endOfDay(end)
    const limit = addDays(today, 7)
    return endDay.getTime() >= today.getTime() && endDay.getTime() <= endOfDay(limit).getTime()
  })

  const rootCount = active.filter((t) => !t.parent_id).length
  const subCount = active.length - rootCount

  const span = getProjectSpan(project)
  let timelinePct = null
  let daysRemaining = null
  let daysTotal = null
  if (span.start && span.end) {
    const startMs = startOfDay(span.start).getTime()
    const endMs = endOfDay(span.end).getTime()
    daysTotal = Math.max(1, Math.ceil((endMs - startMs) / MS_DAY))
    const elapsed = Math.ceil((today.getTime() - startMs) / MS_DAY)
    timelinePct = Math.min(100, Math.max(0, Math.round((elapsed / daysTotal) * 100)))
    daysRemaining = Math.ceil((endMs - today.getTime()) / MS_DAY)
  }

  const projectPastDue =
    span.end &&
    project?.durum !== 'tamamlandi' &&
    project?.durum !== 'iptal' &&
    endOfDay(span.end).getTime() < today.getTime()

  const statusBreakdown = PROJECT_TASK_STATUS_OPTIONS.map((o) => ({
    ...o,
    count: byStatus[o.value] || 0,
    pct: active.length ? Math.round(((byStatus[o.value] || 0) / active.length) * 100) : 0,
  }))

  return {
    progress,
    byStatus,
    statusBreakdown,
    operationalLinked,
    operationalPending,
    overdueTasks: overdueTasks.sort((a, b) =>
      String(a.bitis_tarihi || '').localeCompare(String(b.bitis_tarihi || '')),
    ),
    dueSoonTasks: dueSoonTasks.sort((a, b) =>
      String(a.bitis_tarihi || '').localeCompare(String(b.bitis_tarihi || '')),
    ),
    rootCount,
    subCount,
    timelinePct,
    daysRemaining,
    daysTotal,
    projectPastDue,
    hasTasks: active.length > 0,
  }
}
