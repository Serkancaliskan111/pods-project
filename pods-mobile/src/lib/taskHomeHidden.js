import {
  endOfDay,
  getTaskDueDate,
  isCubicleHomeOverdueTask,
  isTaskActiveForHomeBuckets,
  sortTasksByDueAsc,
  startOfDay,
} from './cubicleHomeTaskBuckets.js'

/**
 * Gecikmiş ve son tarihi bugün değil (dün veya daha eski).
 */
export function isOverdueBeforeToday(task, now = new Date()) {
  if (!isCubicleHomeOverdueTask(task, now)) return false
  const due = getTaskDueDate(task)
  if (!due) return false
  const todayStart = startOfDay(now).getTime()
  const todayEnd = endOfDay(now).getTime()
  const dueMs = due.getTime()
  if (dueMs >= todayStart && dueMs <= todayEnd) return false
  return dueMs < todayStart
}

/** Ana sayfada kullanıcı "geri göster" ile görünür yaptığı gecikmiş (bugün dışı) görev. */
export function isForceShownOnHome(task, now = new Date(), forceShowIds = null) {
  const id = String(task?.id || '')
  if (!id) return false
  const forceSet =
    forceShowIds instanceof Set
      ? forceShowIds
      : new Set(Array.isArray(forceShowIds) ? forceShowIds.map(String) : [])
  if (!forceSet.has(id)) return false
  return isOverdueBeforeToday(task, now)
}

export function shouldHideFromHomeLists(task, now = new Date(), forceShowIds = null) {
  if (!isOverdueBeforeToday(task, now)) return false
  const id = String(task?.id || '')
  if (!id) return false
  if (forceShowIds?.has(id)) return false
  return true
}

export function partitionHomeTasksWithHidden(tasks, now = new Date(), forceShowIds = null) {
  const forceSet =
    forceShowIds instanceof Set
      ? forceShowIds
      : new Set(Array.isArray(forceShowIds) ? forceShowIds.map(String) : [])

  const hidden = []
  const visiblePool = []

  for (const t of tasks || []) {
    if (!isTaskActiveForHomeBuckets(t, now)) continue
    if (shouldHideFromHomeLists(t, now, forceSet)) {
      hidden.push(t)
    } else {
      visiblePool.push(t)
    }
  }

  hidden.sort(sortTasksByDueAsc)

  return { hidden, visiblePool }
}

export function formatHiddenDueLabel(task) {
  const due = getTaskDueDate(task)
  if (!due) return 'Son tarih yok'
  return due.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
