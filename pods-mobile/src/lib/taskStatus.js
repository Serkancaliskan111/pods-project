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

