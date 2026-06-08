import { getPersonalTodoDueAt, toDateInputValue } from './personalTodoApi.js'

function hoursUntil(due, now) {
  return (due.getTime() - now.getTime()) / (60 * 60 * 1000)
}

/**
 * Kontrol listesi son tarih bildirimleri (web zili).
 * - Günü gelince: son tarih bugün ve henüz bitmemiş
 * - 1 saat kala: bitişe ≤60 dk (saat yoksa gün sonu 23:59 baz alınır)
 */
export function buildPersonalTodoNotifications(todos, opts = {}) {
  const now = opts.now || new Date()
  const readIds = opts.readIds || new Set()
  const items = []
  const todayStr = toDateInputValue(now)

  for (const todo of todos || []) {
    if (!todo?.id) continue
    if (todo.durum === 'yapildi' || todo.durum === 'denetimde') continue

    const todoId = String(todo.id)
    const title = todo.baslik || 'Kontrol listesi'
    const due = getPersonalTodoDueAt(todo)
    if (!due) continue

    const dueDay = String(todo.planlanan_tarih).slice(0, 10)
    const msUntil = due.getTime() - now.getTime()
    const href = `/admin/personal-todo?list=${todoId}`

    if (msUntil < 0) {
      const id = `ptodo_overdue:${todoId}`
      if (!readIds.has(id)) {
        items.push({
          id,
          type: 'personal_todo_overdue',
          title: 'Liste son tarihi geçti',
          detail: title,
          href,
          tone: 'danger',
          at: due.toISOString(),
          sortKey: due.getTime(),
        })
      }
      continue
    }

    const h = hoursUntil(due, now)
    if (h > 0 && h <= 1) {
      const id = `ptodo_1h:${todoId}:${due.toISOString()}`
      if (!readIds.has(id)) {
        items.push({
          id,
          type: 'personal_todo_due_1h',
          title: 'Liste bitişine 1 saat kaldı',
          detail: title,
          href,
          tone: 'warning',
          at: due.toISOString(),
          sortKey: due.getTime() - 3600_000,
        })
      }
      continue
    }

    if (dueDay === todayStr) {
      const id = `ptodo_today:${todoId}:${dueDay}`
      if (!readIds.has(id)) {
        items.push({
          id,
          type: 'personal_todo_today',
          title: 'Bugün son tarihli liste',
          detail: title,
          href,
          tone: 'info',
          at: due.toISOString(),
          sortKey: now.getTime(),
        })
      }
    }
  }

  return items
}
