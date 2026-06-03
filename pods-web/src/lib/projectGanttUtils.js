import {
  eachDayInclusive,
  endOfDay,
  startOfDay,
  startOfMonth,
  endOfMonth,
  addDays,
} from './taskCalendarUtils.js'
import { getProjectTaskStatusOption } from './projectStatus.js'
import { summarizeProjectTaskPlan } from './projectTaskPlan.js'

const MS_DAY = 24 * 60 * 60 * 1000

export function parseProjectDate(raw) {
  if (!raw) return null
  const s = String(raw).slice(0, 10)
  const d = new Date(`${s}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function getProjectTaskSpan(task) {
  const start = parseProjectDate(task?.baslangic_tarihi)
  let end = parseProjectDate(task?.bitis_tarihi) || start
  if (start && end && end.getTime() < start.getTime()) end = start
  return { start, end }
}

export function getProjectSpan(project) {
  const start = parseProjectDate(project?.baslangic_tarihi)
  let end = parseProjectDate(project?.bitis_tarihi) || start
  if (start && end && end.getTime() < start.getTime()) end = start
  return { start, end }
}

export function computeProjectBarPlacement(task, rangeStart, rangeEnd, days) {
  const { start, end } = getProjectTaskSpan(task)
  if (!start || !days.length) return null
  const taskEnd = end || start
  const visStart = Math.max(startOfDay(start).getTime(), rangeStart.getTime())
  const visEnd = Math.min(endOfDay(taskEnd).getTime(), rangeEnd.getTime())
  if (visEnd < visStart) return null

  const totalMs = Math.max(MS_DAY, rangeEnd.getTime() - rangeStart.getTime() + 1)
  const leftPct = ((visStart - rangeStart.getTime()) / totalMs) * 100
  const widthPct = ((visEnd - visStart + 1) / totalMs) * 100

  return {
    leftPct: Math.max(0, Math.min(100, leftPct)),
    widthPct: Math.max(0.35, Math.min(100 - leftPct, widthPct)),
  }
}

export function resolveProjectGanttRange(project, tasks) {
  const today = startOfDay(new Date())
  let start = parseProjectDate(project?.baslangic_tarihi)
  let end = parseProjectDate(project?.bitis_tarihi)

  for (const t of tasks || []) {
    const span = getProjectTaskSpan(t)
    if (span.start && (!start || span.start < start)) start = span.start
    if (span.end && (!end || span.end > end)) end = span.end
  }

  if (!start) start = startOfMonth(today)
  if (!end) end = endOfMonth(today)
  if (end.getTime() < start.getTime()) end = start

  start = addDays(startOfDay(start), -3)
  end = addDays(endOfDay(end), 7)

  const days = eachDayInclusive(start, end)
  return { start, end, days }
}

/** Hiyerarşik görev listesini Gantt satırlarına düzleştirir */
export function buildProjectGanttRows(tasks, personMap = {}) {
  const active = (tasks || []).filter((t) => !t.silindi_at)
  const roots = active
    .filter((t) => !t.parent_id)
    .sort((a, b) => (a.sira || 0) - (b.sira || 0) || a.baslik.localeCompare(b.baslik, 'tr'))

  const rows = []

  function personLabel(pid) {
    if (!pid) return null
    const p = personMap[String(pid)]
    if (!p) return null
    return [p.ad, p.soyad].filter(Boolean).join(' ') || p.email || null
  }

  function walk(task, depth) {
    const status = getProjectTaskStatusOption(task.durum)
    const assignee = personLabel(task.sorumlu_personel_id)
    rows.push({
      id: task.id,
      kind: 'task',
      task,
      label: task.baslik,
      indent: depth,
      depth,
      statusLabel: status.label,
      typeLabel: summarizeProjectTaskPlan(task.gorev_tipi || 'normal', task.plan_meta),
      colors: { bg: status.bg, color: status.color, dot: status.color },
      assignee,
    })
    const children = active
      .filter((c) => String(c.parent_id) === String(task.id))
      .sort((a, b) => (a.sira || 0) - (b.sira || 0))
    for (const child of children) walk(child, depth + 1)
  }

  for (const root of roots) walk(root, 0)
  return rows
}

export function computeProjectProgress(tasks) {
  const active = (tasks || []).filter((t) => !t.silindi_at)
  if (!active.length) return { pct: 0, done: 0, total: 0, blocked: 0 }
  const done = active.filter((t) => t.durum === 'tamamlandi').length
  const blocked = active.filter((t) => t.durum === 'bloke').length
  const weighted = active.reduce((sum, t) => {
    if (t.durum === 'tamamlandi') return sum + 100
    const total = Math.max(1, Number(t.toplam_is) || 1)
    const done = Math.min(total, Number(t.yapilan_is) || 0)
    const pct =
      t.ilerleme != null && t.yapilan_is == null && t.toplam_is == null
        ? Math.min(100, Math.max(0, Number(t.ilerleme) || 0))
        : Math.round((done / total) * 100)
    return sum + pct
  }, 0)
  const pct = Math.round(weighted / active.length)
  return { pct, done, total: active.length, blocked }
}

export function isProjectTaskOverdue(task) {
  if (!task || task.durum === 'tamamlandi') return false
  const end = parseProjectDate(task.bitis_tarihi)
  if (!end) return false
  return endOfDay(end).getTime() < startOfDay(new Date()).getTime()
}

export function formatProjectDateLabel(raw) {
  const d = parseProjectDate(raw)
  if (!d) return '—'
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
}
