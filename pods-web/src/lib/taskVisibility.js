/**
 * İşin listelerde kullanılan tek “görünürlük zamanı”.
 * Öncelik: baslama_tarihi → gorunur_tarih → created_at.
 * Oluşturma ve rpc_is_operasyonel_guncelle ile gorunur_tarih baslama_tarihi ile eşitlenir;
 * baslama doluysa gorunur ayrı bir “gecikmiş gösterim” tarihi olarak kullanılmaz.
 */
export function getTaskVisibleAt(task) {
  return task?.baslama_tarihi || task?.gorunur_tarih || task?.created_at || null
}

/** Insert için: gorunur_tarih kolonu başlangıçla aynı ISO olmalı; eksikse fallback. */
export function deriveGorunurFromBaslamaIso(baslamaIso, fallbackIso = null) {
  return baslamaIso || fallbackIso || new Date().toISOString()
}

/**
 * Gerçek zamanlı görünürlük: görünürlük anı şu an veya geçmişte mi.
 * Web iş listesi, kokpit ve operatör ana sayfa için kullanılır.
 */
export function isTaskVisibleNow(task, now = new Date()) {
  const visibleAt = getTaskVisibleAt(task)
  if (!visibleAt) return true
  const date = new Date(visibleAt)
  if (Number.isNaN(date.getTime())) return true
  return date.getTime() <= now.getTime()
}

/**
 * Yerel takvim günü “bugün”: görünürlük zamanı bugünün tarihine düşüyor mu (saat henüz gelmemiş olsa bile).
 * Mobil personel görev listesi bu mantığı kullanır; ISO string karşılaştırması yerine Date ile sınır alır.
 */
export function isTaskVisibleAtInLocalCalendarDay(task, now = new Date()) {
  const visibleAt = getTaskVisibleAt(task)
  if (!visibleAt) return true
  const d = new Date(visibleAt)
  if (Number.isNaN(d.getTime())) return true
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  )
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const t = d.getTime()
  return t >= start.getTime() && t < end.getTime()
}

/**
 * Görünürlük zamanı şu andan sonra (ileri tarihli işler listesi).
 * Zaman damgası yoksa false — güvenli liste için “şimdi görünür” sanılmaz.
 */
export function isTaskVisibilityInstantInFuture(task, now = new Date()) {
  const visibleAt = getTaskVisibleAt(task)
  if (!visibleAt) return false
  return !isTaskVisibleNow(task, now)
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

