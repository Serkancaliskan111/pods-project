import { getActiveProjectTasks } from './projectTasksListUtils.js'
import { isProjectTaskOverdue } from './projectGanttUtils.js'
import { getProjectTaskStatusOption, PROJECT_TASK_STATUS } from './projectStatus.js'
import { formatPersonelDisplayName } from './projectApi.js'
import { getProjectAssigneeName } from './projectTaskPodsAdapter.js'
import { buildProjectSummary } from './projectSummary.js'
import { endOfDay, startOfDay } from './taskCalendarUtils.js'

export const PROJECT_KPI_DATE_FILTERS = [
  { key: 'today', label: 'Bugün' },
  { key: '7d', label: 'Son 7 gün' },
  { key: '30d', label: 'Son 30 gün' },
  { key: '90d', label: 'Son 90 gün' },
  { key: 'custom', label: 'Özel aralık' },
  { key: 'all', label: 'Tüm zamanlar' },
]

function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function parseDateInputLocal(value) {
  const raw = String(value || '').trim()
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const [yy, mm, dd] = raw.split('-').map(Number)
  const dt = new Date(yy, mm - 1, dd, 0, 0, 0, 0)
  return Number.isNaN(dt.getTime()) ? null : dt
}

export function formatDateInputLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** @returns {{ start: Date, end: Date } | null} */
export function resolveProjectDateRange(dateFilter, customStart, customEnd) {
  const now = new Date()
  const startOfToday = startOfDay(now)
  const endOfToday = endOfDay(now)

  if (dateFilter === 'today') {
    return { start: startOfToday, end: endOfToday }
  }
  if (dateFilter === '7d') {
    return { start: addDays(startOfToday, -6), end: endOfToday }
  }
  if (dateFilter === '30d') {
    return { start: addDays(startOfToday, -29), end: endOfToday }
  }
  if (dateFilter === '90d') {
    return { start: addDays(startOfToday, -89), end: endOfToday }
  }
  if (dateFilter === 'custom') {
    let start = parseDateInputLocal(customStart)
    let end = parseDateInputLocal(customEnd)
    if (!start || !end) {
      start = start || addDays(startOfToday, -6)
      end = end || endOfToday
    }
    if (start.getTime() > end.getTime()) {
      const tmp = start
      start = end
      end = tmp
    }
    return {
      start: startOfDay(start),
      end: endOfDay(end),
    }
  }
  return null
}

export function taskMatchesProjectDateRange(task, range) {
  if (!range) return true
  const raw = task?.guncelleme_at || task?.olusturulma_at || task?.bitis_tarihi || task?.baslangic_tarihi
  if (!raw) return false
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return false
  return d >= range.start && d <= range.end
}

export function filterProjectTasksByDateRange(tasks, range) {
  const active = getActiveProjectTasks(tasks)
  if (!range) return active
  return active.filter((t) => taskMatchesProjectDateRange(t, range))
}

export function computeProjectManagerKpis(tasks, range) {
  const filtered = filterProjectTasksByDateRange(tasks, range)
  const now = new Date()
  let pending = 0
  let overdue = 0
  let completed = 0
  let blocked = 0
  let unassigned = 0

  for (const t of filtered) {
    if (t.durum === PROJECT_TASK_STATUS.DONE) completed += 1
    else pending += 1
    if (t.durum === PROJECT_TASK_STATUS.BLOCKED) blocked += 1
    if (!t.sorumlu_personel_id) unassigned += 1
    if (isProjectTaskOverdue(t, now)) overdue += 1
  }

  return {
    filtered,
    total: filtered.length,
    pending,
    overdue,
    completed,
    blocked,
    unassigned,
  }
}

export function buildProjectUrgentAlerts(tasks, range) {
  const filtered = filterProjectTasksByDateRange(tasks, range)
  const now = new Date()
  const overdue = filtered.filter((t) => isProjectTaskOverdue(t, now)).length
  const blocked = filtered.filter((t) => t.durum === PROJECT_TASK_STATUS.BLOCKED).length
  const unassigned = filtered.filter(
    (t) => !t.sorumlu_personel_id && t.durum !== PROJECT_TASK_STATUS.DONE,
  ).length
  const noOperational = filtered.filter(
    (t) => !t.bagli_is_id && t.durum !== PROJECT_TASK_STATUS.DONE,
  ).length

  const items = []
  if (overdue > 0) {
    items.push({
      key: 'overdue',
      title: 'Geciken görevler',
      detail: `${overdue} görev bitiş tarihini geçti.`,
      count: overdue,
      action: 'overdue',
    })
  }
  if (blocked > 0) {
    items.push({
      key: 'blocked',
      title: 'Bloke görevler',
      detail: `${blocked} görev engelli durumda.`,
      count: blocked,
      action: 'blocked',
    })
  }
  if (unassigned > 0) {
    items.push({
      key: 'unassigned',
      title: 'Sorumlu atanmamış',
      detail: `${unassigned} aktif görevde sorumlu yok.`,
      count: unassigned,
      action: 'unassigned',
    })
  }
  if (noOperational > 5) {
    items.push({
      key: 'operational',
      title: 'Operasyonel bağlantı bekleyen',
      detail: `${noOperational} planlama görevi henüz operasyonel işe bağlanmadı.`,
      count: noOperational,
      action: 'operational',
    })
  }
  return items
}

export function formatProjectRelativeTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 0) return 'az önce'
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  if (diffMin < 1) return 'az önce'
  if (diffMin < 60) return `${diffMin} dk önce`
  if (diffHour < 24) return `${diffHour} saat önce`
  if (diffDay < 7) return `${diffDay} gün önce`
  return date.toLocaleDateString('tr-TR')
}

const ACTIVITY_STATUS_STYLES = {
  tamamlandi: { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  bloke: { bg: '#fee2e2', color: '#991b1b', border: '#fecaca' },
  devam: { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' },
  yapilacak: { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' },
}

export function buildProjectActivityFeed(tasks, personMap = {}, limit = 20) {
  return getActiveProjectTasks(tasks)
    .slice()
    .sort((a, b) => {
      const da = new Date(a.guncelleme_at || a.olusturulma_at || 0).getTime()
      const db = new Date(b.guncelleme_at || b.olusturulma_at || 0).getTime()
      return db - da
    })
    .slice(0, limit)
    .map((t) => {
      const st = getProjectTaskStatusOption(t.durum)
      const style = ACTIVITY_STATUS_STYLES[t.durum] || ACTIVITY_STATUS_STYLES.yapilacak
      let actionLabel = 'güncelledi'
      if (t.durum === PROJECT_TASK_STATUS.DONE) actionLabel = 'tamamladı'
      else if (t.durum === PROJECT_TASK_STATUS.BLOCKED) actionLabel = 'bloke işaretledi'
      else if (t.durum === PROJECT_TASK_STATUS.IN_PROGRESS) actionLabel = 'üzerinde çalışıyor'

      return {
        id: t.id,
        task: t,
        title: t.baslik || 'Görev',
        person: getProjectAssigneeName(t, personMap),
        timeRelative: formatProjectRelativeTime(t.guncelleme_at || t.olusturulma_at),
        status: st.label,
        actionLabel,
        isUrgent: !!t.acil,
        statusStyle: style,
      }
    })
}

export function buildProjectTeamWorkload(tasks, teamMembers = [], range) {
  const filtered = filterProjectTasksByDateRange(tasks, range)
  const now = new Date()

  return (teamMembers || []).map((m) => {
    const pid = String(m.personel_id)
    const mine = filtered.filter((t) => String(t.sorumlu_personel_id) === pid)
    const active = mine.filter((t) => t.durum !== PROJECT_TASK_STATUS.DONE)
    const done = mine.filter((t) => t.durum === PROJECT_TASK_STATUS.DONE)
    const overdue = active.filter((t) => isProjectTaskOverdue(t, now)).length
    return {
      personelId: pid,
      name: formatPersonelDisplayName(m),
      total: mine.length,
      active: active.length,
      done: done.length,
      overdue,
    }
  }).sort((a, b) => b.active - a.active || a.overdue - b.overdue)
}

export function buildProjectManagerView(project, tasks, range) {
  const summary = buildProjectSummary(project, tasks)
  const kpis = computeProjectManagerKpis(tasks, range)
  return { summary, kpis }
}
