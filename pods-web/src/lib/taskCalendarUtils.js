import { getTaskWorkStatusOption } from './taskWorkStatus.js'

export const CALENDAR_VIEW = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  LIST: 'list',
}

export const GRID_START_HOUR = 0
export const GRID_END_HOUR = 24
export const HOUR_HEIGHT_PX = 52
export const ALL_DAY_ROW_HEIGHT = 44

export const CALENDAR_FILTER = {
  MINE: 'mine',
  TEAM: 'team',
}

const MS_DAY = 24 * 60 * 60 * 1000

export function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function endOfDay(d) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Pazartesi başlangıçlı hafta */
export function startOfWeekMonday(d) {
  const x = startOfDay(d)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return addDays(x, diff)
}

export function eachDayInclusive(start, end) {
  const days = []
  let cur = startOfDay(start)
  const last = startOfDay(end)
  while (cur.getTime() <= last.getTime()) {
    days.push(new Date(cur))
    cur = addDays(cur, 1)
  }
  return days
}

export function startOfMonth(d) {
  const x = startOfDay(d)
  return new Date(x.getFullYear(), x.getMonth(), 1)
}

export function endOfMonth(d) {
  const x = startOfMonth(d)
  return endOfDay(new Date(x.getFullYear(), x.getMonth() + 1, 0))
}

export function resolveCalendarRange(viewMode, anchorDate) {
  const anchor = startOfDay(anchorDate || new Date())
  if (viewMode === CALENDAR_VIEW.DAY) {
    return { start: anchor, end: endOfDay(anchor), days: [anchor] }
  }
  if (viewMode === CALENDAR_VIEW.WEEK) {
    const start = startOfWeekMonday(anchor)
    const end = endOfDay(addDays(start, 6))
    return { start, end, days: eachDayInclusive(start, addDays(start, 6)) }
  }
  if (viewMode === CALENDAR_VIEW.MONTH) {
    const start = startOfMonth(anchor)
    const end = endOfMonth(anchor)
    return { start, end, days: eachDayInclusive(start, end) }
  }
  // Liste: görünen ay
  const start = startOfMonth(anchor)
  const end = endOfMonth(anchor)
  return { start, end, days: eachDayInclusive(start, end) }
}

export function parseTaskDate(raw) {
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function getTaskSpan(task) {
  const start =
    parseTaskDate(task?.baslama_tarihi) ||
    parseTaskDate(task?.gorunur_tarih) ||
    parseTaskDate(task?.created_at)
  let end = parseTaskDate(task?.son_tarih) || start
  if (start && end && end.getTime() < start.getTime()) end = start
  return { start, end }
}

export function taskOverlapsRange(task, rangeStart, rangeEnd) {
  const { start, end } = getTaskSpan(task)
  if (!start) return false
  const e = end || start
  return start.getTime() <= rangeEnd.getTime() && e.getTime() >= rangeStart.getTime()
}

/**
 * @param {Date} rangeStart
 * @param {Date} rangeEnd
 * @param {Date[]} days
 */
export function computeBarPlacement(task, rangeStart, rangeEnd, days) {
  const { start, end } = getTaskSpan(task)
  if (!start || !days.length) return null
  const taskEnd = end || start
  const visStart = Math.max(start.getTime(), rangeStart.getTime())
  const visEnd = Math.min(taskEnd.getTime(), rangeEnd.getTime())
  if (visEnd < visStart) return null

  const totalMs = Math.max(MS_DAY, rangeEnd.getTime() - rangeStart.getTime() + 1)
  const leftPct = ((visStart - rangeStart.getTime()) / totalMs) * 100
  const widthPct = ((visEnd - visStart + 1) / totalMs) * 100

  return {
    leftPct: Math.max(0, Math.min(100, leftPct)),
    widthPct: Math.max(0.35, Math.min(100 - leftPct, widthPct)),
  }
}

export function formatCalendarDayHeader(d, compact = false) {
  if (!d || Number.isNaN(d.getTime())) return '—'
  if (compact) {
    return d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' })
  }
  return d.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatCalendarRangeLabel(start, end, viewMode) {
  if (viewMode === CALENDAR_VIEW.DAY) {
    return start.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }
  if (viewMode === CALENDAR_VIEW.MONTH || viewMode === CALENDAR_VIEW.LIST) {
    return start.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
  }
  const a = start.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
  const b = end.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
  if (a === b) return a
  return `${a} – ${b}`
}

export function formatTimeHm(d) {
  if (!d || Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

export function formatEventTimeRange(segStart, segEnd) {
  return `${formatTimeHm(segStart)} - ${formatTimeHm(segEnd)}`
}

function dateHasExplicitTime(d) {
  if (!d) return false
  return d.getHours() !== 0 || d.getMinutes() !== 0
}

function sameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Görevi belirli bir gün için tüm gün / saatli olarak sınıflandırır.
 */
export function classifyTaskOnDay(task, day) {
  const { start, end } = getTaskSpan(task)
  if (!start) return null
  const dayStart = startOfDay(day)
  const dayEnd = endOfDay(day)
  const taskEnd = end || start
  if (taskEnd.getTime() < dayStart.getTime() || start.getTime() > dayEnd.getTime()) {
    return null
  }

  let segStart = new Date(Math.max(start.getTime(), dayStart.getTime()))
  let segEnd = new Date(Math.min(taskEnd.getTime(), dayEnd.getTime()))
  const multiDay = !sameCalendarDay(start, taskEnd)
  const bothMidnight = !dateHasExplicitTime(start) && !dateHasExplicitTime(taskEnd)
  const longBlock = segEnd.getTime() - segStart.getTime() >= 20 * 60 * 60 * 1000

  if (multiDay || bothMidnight || longBlock) {
    return {
      type: 'allday',
      task,
      segStart,
      segEnd,
      key: `${task.id}-allday-${dayStart.toISOString().slice(0, 10)}`,
    }
  }

  if (!dateHasExplicitTime(segStart) && !dateHasExplicitTime(segEnd)) {
    segStart = new Date(segStart)
    segStart.setHours(9, 0, 0, 0)
    segEnd = new Date(segStart)
    segEnd.setHours(10, 0, 0, 0)
  } else if (!dateHasExplicitTime(segEnd) || segEnd.getTime() <= segStart.getTime()) {
    segEnd = new Date(segStart)
    segEnd.setHours(segEnd.getHours() + 1)
  }

  return {
    type: 'timed',
    task,
    segStart,
    segEnd,
    startMs: segStart.getTime(),
    endMs: segEnd.getTime(),
    key: `${task.id}-timed-${dayStart.toISOString().slice(0, 10)}`,
  }
}

export function partitionTasksForDay(tasks, day) {
  const allDay = []
  const timed = []
  for (const task of tasks || []) {
    const item = classifyTaskOnDay(task, day)
    if (!item) continue
    if (item.type === 'allday') allDay.push(item)
    else timed.push(item)
  }
  return { allDay, timed }
}

export function layoutOverlappingTimedEvents(timedSegments) {
  const sorted = [...timedSegments].sort((a, b) => a.startMs - b.startMs)
  const columnEnds = []
  const placed = []

  for (const seg of sorted) {
    let col = 0
    while (col < columnEnds.length && columnEnds[col] > seg.startMs) {
      col += 1
    }
    if (col === columnEnds.length) columnEnds.push(0)
    columnEnds[col] = seg.endMs
    placed.push({ ...seg, column: col })
  }

  const columnCount = Math.max(1, columnEnds.length)
  return placed.map((seg) => ({
    ...seg,
    columnCount,
    leftPct: (seg.column / columnCount) * 100,
    widthPct: 100 / columnCount,
  }))
}

export function timeToTopPx(date, gridStartHour = GRID_START_HOUR, hourHeight = HOUR_HEIGHT_PX) {
  const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
  return Math.max(0, (h - gridStartHour) * hourHeight)
}

export function durationToHeightPx(start, end, hourHeight = HOUR_HEIGHT_PX) {
  const ms = Math.max(end.getTime() - start.getTime(), 30 * 60 * 1000)
  return Math.max(28, (ms / (60 * 60 * 1000)) * hourHeight)
}

export function getTimedEventStyle(seg, gridStartHour, hourHeight) {
  const top = timeToTopPx(seg.segStart, gridStartHour, hourHeight)
  const height = durationToHeightPx(seg.segStart, seg.segEnd, hourHeight)
  const maxTop = (GRID_END_HOUR - gridStartHour) * hourHeight
  return {
    top: Math.min(top, maxTop - 24),
    height: Math.min(height, maxTop - top),
  }
}

export function getCalendarEventColors(task) {
  const opt = getTaskWorkStatusOption(task?.calisma_durumu)
  return {
    bg: opt.pillBg || '#EDE9FE',
    border: opt.dot || '#8B5CF6',
    text: opt.pillText || '#4C1D95',
  }
}

/** Ay görünümü: takvim ızgarası (önceki/sonraki ay dolgulu) */
export function buildMonthGridCells(monthAnchor) {
  const first = startOfMonth(monthAnchor)
  const last = endOfMonth(monthAnchor)
  const padStart = (first.getDay() + 6) % 7
  const cells = []
  for (let i = padStart; i > 0; i -= 1) {
    cells.push({ date: addDays(first, -i), outside: true })
  }
  for (const d of eachDayInclusive(first, last)) {
    cells.push({ date: d, outside: false })
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: addDays(cells[cells.length - 1].date, 1), outside: true })
  }
  while (cells.length < 42) {
    cells.push({ date: addDays(cells[cells.length - 1].date, 1), outside: true })
  }
  return cells
}

export function tasksOnCalendarDay(tasks, day) {
  return (tasks || []).filter((t) => {
    const { start, end } = getTaskSpan(t)
    if (!start) return false
    const e = end || start
    const ds = startOfDay(day)
    const de = endOfDay(day)
    return start.getTime() <= de.getTime() && e.getTime() >= ds.getTime()
  })
}

export function staffDisplayName(staffMap, personelId) {
  if (!personelId) return 'Atanmamış'
  const row = staffMap?.[String(personelId)]
  if (!row) return 'Personel'
  const name = [row.ad, row.soyad].filter(Boolean).join(' ').trim()
  return name || row.email || 'Personel'
}

export function getTaskBarColors(task) {
  const opt = getTaskWorkStatusOption(task?.calisma_durumu)
  return { bg: opt.pillBg, color: opt.pillText, dot: opt.dot }
}

/**
 * @param {Array<object>} tasks
 * @param {'mine'|'team'} filter
 * @param {string} personelId
 * @param {Record<string,object>} staffMap
 */
export function buildGanttRows(tasks, filter, personelId, staffMap) {
  const pid = String(personelId || '')
  const list = (tasks || []).slice()

  if (filter === CALENDAR_FILTER.TEAM) {
    const byPerson = new Map()
    for (const t of list) {
      const assignee = String(t?.sorumlu_personel_id || '__none__')
      if (!byPerson.has(assignee)) byPerson.set(assignee, [])
      byPerson.get(assignee).push(t)
    }
    const personIds = [...byPerson.keys()].sort((a, b) => {
      const na = staffDisplayName(staffMap, a === '__none__' ? null : a)
      const nb = staffDisplayName(staffMap, b === '__none__' ? null : b)
      return na.localeCompare(nb, 'tr')
    })
    const rows = []
    for (const assigneeId of personIds) {
      const personTasks = byPerson.get(assigneeId) || []
      personTasks.sort((a, b) => {
        const sa = getTaskSpan(a).start?.getTime() || 0
        const sb = getTaskSpan(b).start?.getTime() || 0
        return sa - sb
      })
      const label =
        assigneeId === '__none__'
          ? 'Atanmamış'
          : staffDisplayName(staffMap, assigneeId)
      rows.push({
        kind: 'person',
        id: `person-${assigneeId}`,
        label,
        taskCount: personTasks.length,
      })
      for (const task of personTasks) {
        rows.push({
          kind: 'task',
          id: String(task.id),
          label: task.baslik || 'Görev',
          sublabel: null,
          task,
          indent: true,
        })
      }
    }
    return rows
  }

  list.sort((a, b) => {
    const sa = getTaskSpan(a).start?.getTime() || 0
    const sb = getTaskSpan(b).start?.getTime() || 0
    return sa - sb
  })

  return list.map((task) => ({
    kind: 'task',
    id: String(task.id),
    label: task.baslik || 'Görev',
    sublabel: null,
    task,
    indent: false,
  }))
}

export function shiftAnchor(viewMode, anchor, direction) {
  const sign = direction === 'next' ? 1 : -1
  if (viewMode === CALENDAR_VIEW.DAY) {
    return addDays(anchor, sign)
  }
  if (viewMode === CALENDAR_VIEW.WEEK) {
    return addDays(anchor, sign * 7)
  }
  if (viewMode === CALENDAR_VIEW.MONTH || viewMode === CALENDAR_VIEW.LIST) {
    const x = new Date(anchor)
    x.setMonth(x.getMonth() + sign)
    return startOfDay(x)
  }
  return addDays(anchor, sign)
}
