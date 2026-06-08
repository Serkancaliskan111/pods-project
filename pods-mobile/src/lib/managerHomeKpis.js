import {
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
  normalizeTaskStatus,
} from './taskStatus'

export const MANAGER_KPI_DATE_FILTERS = [
  { key: 'today', label: 'Bugün' },
  { key: '7d', label: 'Son 7 gün' },
  { key: '30d', label: 'Son 30 gün' },
  { key: '90d', label: 'Son 90 gün' },
  { key: 'all', label: 'Tümü' },
]

export function resolveManagerKpiDateRange(dateFilter) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  if (dateFilter === 'today') {
    return { start: startOfToday, end: endOfToday }
  }
  if (dateFilter === '7d') {
    const start = new Date(startOfToday)
    start.setDate(start.getDate() - 6)
    return { start, end: endOfToday }
  }
  if (dateFilter === '30d') {
    const start = new Date(startOfToday)
    start.setDate(start.getDate() - 29)
    return { start, end: endOfToday }
  }
  if (dateFilter === '90d') {
    const start = new Date(startOfToday)
    start.setDate(start.getDate() - 89)
    return { start, end: endOfToday }
  }
  return null
}

export function isTaskInKpiDateRange(rawDate, range) {
  if (!range) return true
  if (!rawDate) return false
  const d = new Date(rawDate)
  if (Number.isNaN(d.getTime())) return false
  return d >= range.start && d <= range.end
}

/** Web AdminDashboard `isOverdueTask` ile aynı */
export function isManagerKpiOverdueTask(task, now = new Date()) {
  const durum = normalizeTaskStatus(task?.durum)
  if (!task?.son_tarih) return false
  if (isApprovedTaskStatus(durum)) return false
  const due = new Date(task.son_tarih)
  if (Number.isNaN(due.getTime()) || due >= now) return false
  if (isPendingApprovalTaskStatus(durum)) {
    const completedAt = new Date(task.updated_at || task.created_at || 0)
    if (!Number.isNaN(completedAt.getTime()) && completedAt <= due) {
      return false
    }
  }
  return true
}

/** Web AdminDashboard `metricView.kpis` ile aynı mantık */
export function computeManagerHomeKpis(jobs = [], dateFilter = 'today') {
  const range = resolveManagerKpiDateRange(dateFilter)
  const now = new Date()
  const filtered = (jobs || []).filter((t) =>
    isTaskInKpiDateRange(t?.updated_at || t?.created_at || t?.son_tarih, range),
  )

  let pending = 0
  let overdue = 0
  let completed = 0
  for (const t of filtered) {
    if (isPendingApprovalTaskStatus(t?.durum)) pending += 1
    if (isApprovedTaskStatus(t?.durum)) completed += 1
    if (isManagerKpiOverdueTask(t, now)) overdue += 1
  }

  return {
    pending,
    overdue,
    completed,
    totalTasks: filtered.length,
  }
}

export function labelForManagerKpiDateFilter(key) {
  return MANAGER_KPI_DATE_FILTERS.find((f) => f.key === key)?.label || 'Bugün'
}
