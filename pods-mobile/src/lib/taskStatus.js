export const TASK_STATUS = Object.freeze({
  ASSIGNED: 'Atandı',
  PENDING_APPROVAL: 'Onay Bekliyor',
  APPROVED: 'Onaylandı',
  RESUBMITTED: 'Tekrar Gönderildi',
  REJECTED: 'Reddedildi',
})

const LEGACY_MAP = Object.freeze({
  ATANDI: TASK_STATUS.ASSIGNED,
  atandi: TASK_STATUS.ASSIGNED,
  bekliyor: TASK_STATUS.ASSIGNED,
  'Onaylanmadı': TASK_STATUS.REJECTED,
  onaylanmadi: TASK_STATUS.REJECTED,
  reddedildi: TASK_STATUS.REJECTED,
  TAMAMLANDI: TASK_STATUS.APPROVED,
  Tamamlandı: TASK_STATUS.APPROVED,
  tamamlandi: TASK_STATUS.APPROVED,
  onaylandi: TASK_STATUS.APPROVED,
})

export function normalizeTaskStatus(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return LEGACY_MAP[raw] || raw
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

export function getTaskStatusLabel(value) {
  return normalizeTaskStatus(value) || '-'
}

/**
 * Web rpc_is_operasyonel_guncelle ile uyumlu: düzenlenebilir iş önkoşulu.
 */
export function taskOperationalEditEligible(task) {
  if (!task) return false
  const tekrar = Number(task.tekrar_gonderim_sayisi || 0)
  if (tekrar !== 0) return false
  const normalized = normalizeTaskStatus(task.durum)
  if (normalized === TASK_STATUS.APPROVED) return false
  if (normalized === TASK_STATUS.REJECTED) return false
  if (normalized === TASK_STATUS.RESUBMITTED) return false
  if (isApprovedTaskStatus(task.durum)) return false
  return true
}

