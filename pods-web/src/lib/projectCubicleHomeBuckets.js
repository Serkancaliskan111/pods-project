import { endOfDay, startOfDay } from './cubicleHomeTaskBuckets.js'
import { mapProjectTasksForPodsUI } from './projectTaskPodsAdapter.js'
import { PROJECT_TASK_STATUS } from './projectStatus.js'

function addDays(d, days) {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

function getDueDate(task) {
  const raw = task?.son_tarih
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function isActive(task) {
  return task?.durum !== PROJECT_TASK_STATUS.DONE
}

function isOverdue(task, now = new Date()) {
  if (!isActive(task)) return false
  const due = getDueDate(task)
  return due ? due.getTime() < now.getTime() : false
}

function isTodayTask(task, now = new Date()) {
  if (!isActive(task) || isOverdue(task, now)) return false
  const due = getDueDate(task)
  if (!due) return false
  return due.getTime() >= startOfDay(now).getTime() && due.getTime() <= endOfDay(now).getTime()
}

function isTomorrowTask(task, now = new Date()) {
  if (!isActive(task) || isOverdue(task, now)) return false
  const due = getDueDate(task)
  if (!due) return false
  const t0 = startOfDay(addDays(now, 1))
  const t1 = endOfDay(addDays(now, 1))
  return due.getTime() >= t0.getTime() && due.getTime() <= t1.getTime()
}

export function partitionProjectHomeBuckets(tasks, now = new Date()) {
  const list = mapProjectTasksForPodsUI(tasks)
  const overdue = []
  const today = []
  const tomorrow = []
  const upcoming = []

  for (const t of list) {
    if (!isActive(t)) continue
    if (isOverdue(t, now)) overdue.push(t)
    else if (isTodayTask(t, now)) today.push(t)
    else if (isTomorrowTask(t, now)) tomorrow.push(t)
    else upcoming.push(t)
  }

  const byDue = (a, b) => (getDueDate(a)?.getTime() || 0) - (getDueDate(b)?.getTime() || 0)
  overdue.sort(byDue)
  today.sort(byDue)
  tomorrow.sort(byDue)
  upcoming.sort(byDue)

  return { overdue, today, tomorrow, upcoming }
}
