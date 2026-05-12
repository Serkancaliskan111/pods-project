export const TASK_STATUS = Object.freeze({
  ASSIGNED: 'Atandı',
  PENDING_APPROVAL: 'Onay Bekliyor',
  APPROVED: 'Onaylandı',
  RESUBMITTED: 'Tekrar Gönderildi',
  REJECTED: 'Reddedildi',
})

/**
 * Sıralı/zincir görev adım durumları — `TASK_STATUS` ile uyumlu, ek olarak
 * adım yaşam döngüsünde geçen "Aktif" ve "Beklemede" durumlarını içerir.
 * Bu sözlük tüm sistemde (web + mobil) tek tip etikete bağlanmamızı sağlar.
 */
export const STEP_STATUS = Object.freeze({
  ACTIVE: 'Aktif',
  WAITING: 'Beklemede',
  PENDING_APPROVAL: TASK_STATUS.PENDING_APPROVAL,
  APPROVED: TASK_STATUS.APPROVED,
  REJECTED: TASK_STATUS.REJECTED,
})

const LEGACY_MAP = Object.freeze({
  ATANDI: TASK_STATUS.ASSIGNED,
  atandi: TASK_STATUS.ASSIGNED,
  'atandı': TASK_STATUS.ASSIGNED,
  bekliyor: TASK_STATUS.ASSIGNED,
  onay_bekliyor: TASK_STATUS.PENDING_APPROVAL,
  'onay bekliyor': TASK_STATUS.PENDING_APPROVAL,
  'onay_beklemede': TASK_STATUS.PENDING_APPROVAL,
  tekrar_gonderildi: TASK_STATUS.RESUBMITTED,
  'tekrar gönderildi': TASK_STATUS.RESUBMITTED,
  'Onaylanmadı': TASK_STATUS.REJECTED,
  onaylanmadi: TASK_STATUS.REJECTED,
  reddedildi: TASK_STATUS.REJECTED,
  TAMAMLANDI: TASK_STATUS.APPROVED,
  Tamamlandı: TASK_STATUS.APPROVED,
  tamamlandi: TASK_STATUS.APPROVED,
  onaylandi: TASK_STATUS.APPROVED,
  ONAYLANDI: TASK_STATUS.APPROVED,
  Onaylandi: TASK_STATUS.APPROVED,
  REDDEDILDI: TASK_STATUS.REJECTED,
  Reddedildi: TASK_STATUS.REJECTED,
})

const STEP_LEGACY_MAP = Object.freeze({
  aktif: STEP_STATUS.ACTIVE,
  Aktif: STEP_STATUS.ACTIVE,
  AKTIF: STEP_STATUS.ACTIVE,
  beklemede: STEP_STATUS.WAITING,
  Beklemede: STEP_STATUS.WAITING,
  sira_bekliyor: STEP_STATUS.WAITING,
  'sıra bekliyor': STEP_STATUS.WAITING,
  bekliyor: STEP_STATUS.WAITING,
})

export function normalizeTaskStatus(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return LEGACY_MAP[raw] || LEGACY_MAP[raw.toLowerCase()] || raw
}

/**
 * Sıralı/zincir görev adım durumunu (`adim_durum` veya `durum`) tek tip etikete
 * çevirir. Önce adım-spesifik aktif/beklemede etiketlerine bakar; bulamazsa
 * normal `normalizeTaskStatus` (Onaylandı/Reddedildi/Onay Bekliyor) etiketine
 * düşer. Boş veya tanınmayan değer için orijinal değeri geri verir.
 */
export function normalizeStepStatus(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (STEP_LEGACY_MAP[lower]) return STEP_LEGACY_MAP[lower]
  if (STEP_LEGACY_MAP[raw]) return STEP_LEGACY_MAP[raw]
  return normalizeTaskStatus(raw)
}

/**
 * Sıralı/zincir adımının "iş bitti" anlamını taşıyıp taşımadığını söyler.
 * (Onaylandı / Tamamlandı durumları için true)
 */
export function isStepApprovedStatus(value) {
  return normalizeStepStatus(value) === STEP_STATUS.APPROVED
}

export function isApprovedTaskStatus(value) {
  return normalizeTaskStatus(value) === TASK_STATUS.APPROVED
}

export function isPendingApprovalTaskStatus(value) {
  const status = normalizeTaskStatus(value)
  return (
    status === TASK_STATUS.PENDING_APPROVAL || status === TASK_STATUS.RESUBMITTED
  )
}

/**
 * is.duzenle (RPC): onay bekleyen / onaylı / reddedilmiş / tekrar sürecindeki işler düzenlenemez.
 * DB ile uyum: tekrar_gonderim_sayisi > 0 ise uygun değil.
 */
export function taskOperationalEditEligible(task) {
  if (!task) return false
  const tekrar = Number(task.tekrar_gonderim_sayisi || 0)
  if (tekrar !== 0) return false
  const normalized = normalizeTaskStatus(task.durum)
  if (normalized === TASK_STATUS.PENDING_APPROVAL) return false
  if (normalized === TASK_STATUS.APPROVED) return false
  if (normalized === TASK_STATUS.REJECTED) return false
  if (normalized === TASK_STATUS.RESUBMITTED) return false
  if (isApprovedTaskStatus(task.durum)) return false
  return true
}

