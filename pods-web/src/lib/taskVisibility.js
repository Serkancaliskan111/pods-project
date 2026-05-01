/** Öncelik başlangıç: görünür zaman sistemde başlangıç zamanıyla aynı kabul edilir. */
export function getTaskVisibleAt(task) {
  return task?.baslama_tarihi || task?.gorunur_tarih || task?.created_at || null
}

/** Insert için: gorunur_tarih kolonu başlangıçla aynı ISO olmalı; eksikse fallback. */
export function deriveGorunurFromBaslamaIso(baslamaIso, fallbackIso = null) {
  return baslamaIso || fallbackIso || new Date().toISOString()
}

export function isTaskVisibleNow(task, now = new Date()) {
  const visibleAt = getTaskVisibleAt(task)
  if (!visibleAt) return true
  const date = new Date(visibleAt)
  if (Number.isNaN(date.getTime())) return true
  return date.getTime() <= now.getTime()
}

function normalizeId(value) {
  return String(value || '').trim()
}

export function isPrivateTask(task) {
  return task?.ozel_gorev === true
}

export function isTaskVisibleToPerson(task, personelId) {
  if (!isPrivateTask(task)) return true
  const currentId = normalizeId(personelId)
  if (!currentId) return false
  const assignerId = normalizeId(task?.atayan_personel_id)
  const assigneeId = normalizeId(task?.sorumlu_personel_id)
  return currentId === assignerId || currentId === assigneeId
}

