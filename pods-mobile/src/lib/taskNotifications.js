import { isTaskAssignedToPersonel } from './taskWorkEligibility.js'
import { isApprovedTaskStatus, isPendingApprovalTaskStatus } from './taskStatus.js'
import { isTaskVisibleNow } from './taskVisibility.js'
function getTaskDueDate(task) {
  const raw = task?.son_tarih || task?.baslama_tarihi || task?.gorunur_tarih
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

import { getStoredItem, setStoredItem } from './storage.js'

const READ_STORAGE_KEY = 'pods_mobile_task_notif_read_v1'
const readCache = new Map()

export async function loadReadNotificationIdsAsync(personelId) {
  if (!personelId) return new Set()
  try {
    const raw = await getStoredItem(`${READ_STORAGE_KEY}:${personelId}`)
    const arr = raw ? JSON.parse(raw) : []
    const set = new Set(Array.isArray(arr) ? arr : [])
    readCache.set(String(personelId), set)
    return set
  } catch {
    return new Set()
  }
}

export function loadReadNotificationIds(personelId) {
  if (!personelId) return new Set()
  return readCache.get(String(personelId)) || new Set()
}

export async function saveReadNotificationIdsAsync(personelId, ids) {
  if (!personelId) return
  const set = ids instanceof Set ? ids : new Set(ids || [])
  readCache.set(String(personelId), set)
  try {
    await setStoredItem(
      `${READ_STORAGE_KEY}:${personelId}`,
      JSON.stringify([...set].slice(-200)),
    )
  } catch {
    /* ignore */
  }
}

export function saveReadNotificationIds(personelId, ids) {
  void saveReadNotificationIdsAsync(personelId, ids)
}

function hoursUntil(due, now) {
  return (due.getTime() - now.getTime()) / (60 * 60 * 1000)
}

/**
 * @param {Array<object>} tasks
 * @param {string} personelId
 * @param {{ now?: Date, readIds?: Set, canReview?: boolean }} opts
 */
export function buildTaskNotifications(tasks, personelId, opts = {}) {
  const now = opts.now || new Date()
  const readIds = opts.readIds || new Set()
  const canReview = !!opts.canReview
  const items = []
  const pid = String(personelId || '')

  for (const task of tasks || []) {
    if (!task?.id || !isTaskVisibleNow(task, now)) continue
    const taskId = String(task.id)
    const title = task.baslik || 'Görev'
    const due = getTaskDueDate(task)
    const approved = isApprovedTaskStatus(task.durum)
    const pendingApproval = isPendingApprovalTaskStatus(task.durum)
    const assignedToMe = isTaskAssignedToPersonel(task, pid)

    if (assignedToMe && !approved && !pendingApproval) {
      const created = task.created_at ? new Date(task.created_at) : null
      const isNew =
        created &&
        !Number.isNaN(created.getTime()) &&
        now.getTime() - created.getTime() < 48 * 60 * 60 * 1000
      if (isNew) {
        const id = `assigned:${taskId}`
        if (!readIds.has(id)) {
          items.push({
            id,
            type: 'assigned',
            title: 'Yeni görev atandı',
            detail: title,
            href: `/admin/tasks/${taskId}`,
            tone: 'info',
            at: created.toISOString(),
            sortKey: created.getTime(),
          })
        }
      }

      if (due && !Number.isNaN(due.getTime())) {
        const overdue = due.getTime() < now.getTime()
        const h = hoursUntil(due, now)
        if (overdue) {
          const id = `overdue:${taskId}`
          if (!readIds.has(id)) {
            items.push({
              id,
              type: 'overdue',
              title: 'Görev gecikti',
              detail: title,
              href: `/admin/tasks/${taskId}/complete`,
              tone: 'danger',
              at: due.toISOString(),
              sortKey: due.getTime(),
            })
          }
        } else if (h >= 0 && h <= 24) {
          const id = `due:${taskId}:${due.toISOString().slice(0, 10)}`
          if (!readIds.has(id)) {
            items.push({
              id,
              type: 'due_soon',
              title: h <= 2 ? 'Görev süresi yaklaşıyor' : 'Bugün son tarihli görev',
              detail: title,
              href: `/admin/tasks/${taskId}/complete`,
              tone: h <= 2 ? 'warning' : 'info',
              at: due.toISOString(),
              sortKey: due.getTime(),
            })
          }
        }
      }
    }

    if (canReview && pendingApproval && !assignedToMe) {
      const id = `audit:${taskId}`
      if (!readIds.has(id)) {
        const at = task.updated_at || task.created_at
        items.push({
          id,
          type: 'audit_pending',
          title: 'Onay bekleyen görev',
          detail: title,
          href: `/admin/audit/pending`,
          tone: 'info',
          at: at || null,
          sortKey: at ? new Date(at).getTime() : 0,
        })
      }
    }
  }

  items.sort((a, b) => (b.sortKey || 0) - (a.sortKey || 0))
  return items.slice(0, 30)
}

export function countUnreadNotifications(notifications, readIds) {
  return (notifications || []).filter((n) => !readIds.has(n.id)).length
}
