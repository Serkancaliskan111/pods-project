import { TASK_STATUS, normalizeTaskStatus } from '../../../lib/taskStatus.js'

export function formatTaskTs(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('tr-TR')
}

export function taskStatusTone(normalizedStatus, { isApproved } = {}) {
  if (normalizedStatus === TASK_STATUS.REJECTED) return 'danger'
  if (normalizedStatus === TASK_STATUS.RESUBMITTED) return 'primary'
  if (isApproved) return 'success'
  return 'soft'
}

export function fullNameFromPerson(p) {
  if (!p) return '—'
  const n = `${p.ad || ''} ${p.soyad || ''}`.trim()
  return n || p.email || '—'
}

export function personRefLabel(row, personelId) {
  if (row) return fullNameFromPerson(row)
  if (personelId) return `Personel (${String(personelId).slice(0, 8)}…)`
  return '—'
}
