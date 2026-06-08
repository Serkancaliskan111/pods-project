import {
  eachDayInclusive,
  endOfDay,
  startOfDay,
  startOfMonth,
  endOfMonth,
  addDays,
  getTaskSpan,
  staffDisplayName,
} from './taskCalendarUtils.js'
import { getProjectTaskStatusOption } from './projectStatus.js'

export const PROJECT_GANTT_LAYOUT = {
  HIERARCHY: 'hierarchy',
  TEAM: 'team',
}

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

function sortProjectGanttTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const sa = getTaskSpan(a).start?.getTime() || 0
    const sb = getTaskSpan(b).start?.getTime() || 0
    return sa - sb || String(a.baslik || '').localeCompare(String(b.baslik || ''), 'tr')
  })
}

/** Ekip modu: proje ekibi sırası + personel başlık satırları (takvim Gantt ile aynı görünüm) */
export function buildProjectGanttTeamRows(
  tasks,
  teamMembers = [],
  personMap = {},
  { onlyMemberIds = null } = {},
) {
  const active = (tasks || []).filter((t) => !t.silindi_at)
  const byPerson = new Map()
  for (const t of active) {
    const assignee = String(t?.sorumlu_personel_id || '__none__')
    if (!byPerson.has(assignee)) byPerson.set(assignee, [])
    byPerson.get(assignee).push(t)
  }

  const onlySet = onlyMemberIds?.length ? new Set(onlyMemberIds.map(String)) : null
  const membersToList = (teamMembers || []).filter(
    (m) => !onlySet || onlySet.has(String(m.personel_id)),
  )

  const rows = []
  const seen = new Set()

  const emitBlock = (assigneeId, label) => {
    const personTasks = sortProjectGanttTasks(byPerson.get(assigneeId) || [])
    seen.add(assigneeId)
    rows.push({
      kind: 'person',
      id: `person-${assigneeId}`,
      assigneeId: assigneeId === '__none__' ? null : assigneeId,
      label,
      taskCount: personTasks.length,
    })
    for (const task of personTasks) {
      rows.push({
        kind: 'task',
        id: String(task.id),
        label: task.baslik || 'Görev',
        task,
        indent: true,
      })
    }
  }

  for (const m of membersToList) {
    const id = String(m.personel_id)
    emitBlock(id, staffDisplayName(personMap, id))
  }

  const extraIds = [...byPerson.keys()]
    .filter((id) => id !== '__none__' && !seen.has(id))
    .sort((a, b) =>
      staffDisplayName(personMap, a).localeCompare(staffDisplayName(personMap, b), 'tr'),
    )
  for (const id of extraIds) {
    emitBlock(id, staffDisplayName(personMap, id))
  }

  if (byPerson.has('__none__')) {
    emitBlock('__none__', 'Atanmamış')
  }

  return rows
}

/** Hiyerarşik veya ekip düzeni → TaskGantt satır formatı */
export function buildProjectGanttRows(
  tasks,
  personMap = {},
  layout = PROJECT_GANTT_LAYOUT.HIERARCHY,
  teamMembers = [],
) {
  if (layout === PROJECT_GANTT_LAYOUT.TEAM) {
    return buildProjectGanttTeamRows(tasks, teamMembers, personMap)
  }

  const active = (tasks || []).filter((t) => !t.silindi_at)
  const roots = active
    .filter((t) => !t.parent_id)
    .sort((a, b) => (a.sira || 0) - (b.sira || 0) || a.baslik.localeCompare(b.baslik, 'tr'))

  const rows = []

  function walk(task, depth) {
    rows.push({
      id: String(task.id),
      kind: 'task',
      task,
      label: task.baslik || 'Görev',
      indent: depth > 0,
      indentLevel: depth,
    })
    const children = active
      .filter((c) => String(c.parent_id) === String(task.id))
      .sort((a, b) => (a.sira || 0) - (b.sira || 0))
    for (const child of children) walk(child, depth + 1)
  }

  for (const root of roots) walk(root, 0)
  return rows
}

export function getProjectGanttBarColors(task) {
  const status = getProjectTaskStatusOption(task?.durum)
  return { bg: status.bg, color: status.color, dot: status.color }
}

export function getProjectGanttStatusLabel(task) {
  return getProjectTaskStatusOption(task?.durum).label
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
