import { Icon } from '../../ui'
import {
  TASK_STATUS,
  normalizeTaskStatus,
} from '../../lib/taskStatus'

export const DAILY_TARGET_POINTS = 3000

export function mapRecentStatusMeta(durum) {
  const status = normalizeTaskStatus(durum)
  if (status === TASK_STATUS.PENDING_APPROVAL || status === TASK_STATUS.RESUBMITTED) {
    return { label: status, tone: 'pending' }
  }
  if (status === TASK_STATUS.REJECTED) return { label: TASK_STATUS.REJECTED, tone: 'rejected' }
  if (status === TASK_STATUS.APPROVED) return { label: TASK_STATUS.APPROVED, tone: 'approved' }
  if (status === TASK_STATUS.ASSIGNED) return { label: TASK_STATUS.ASSIGNED, tone: 'pending' }
  return { label: String(status || durum || 'Durum'), tone: 'pending' }
}

export function mapGorevTuruBadge(gorevTuru) {
  const t = String(gorevTuru || '').toLowerCase()
  if (t === 'zincir_gorev') return { Icon: Icon.Chain, label: 'Zincir Görev' }
  if (t === 'zincir_onay') return { Icon: Icon.TaskComplete, label: 'Zincir Onay' }
  if (t === 'zincir_gorev_ve_onay') return { Icon: Icon.Chain, label: 'Zincir Görev + Onay' }
  if (t === 'sablon_gorev') return { Icon: Icon.Tasks, label: 'Şablon' }
  if (t === 'sirali_gorev') return { Icon: Icon.Tasks, label: 'Sıralı' }
  return null
}
