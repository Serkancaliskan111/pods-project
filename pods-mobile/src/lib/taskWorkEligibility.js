import {
  isSiraliGorevTuru,
  isZincirGorevTuru,
  isZincirOnayTuru,
} from './zincirTasks.js'
import {
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
  normalizeTaskStatus,
  TASK_STATUS,
} from './taskStatus.js'
import { isTaskVisibleNow } from './taskVisibility.js'

export function isTaskAssignedToPersonel(task, personelId) {
  const pid = String(personelId || '')
  if (!pid || !task) return false
  if (task._isGrouped && Array.isArray(task._groupAssigneeIds)) {
    return task._groupAssigneeIds.some((id) => String(id) === pid)
  }
  return String(task?.sorumlu_personel_id || '') === pid
}

function getPersonelRowInGroup(task, personelId) {
  if (!task?._isGrouped || !Array.isArray(task._groupRows)) return null
  const pid = String(personelId || '')
  return task._groupRows.find((r) => String(r?.sorumlu_personel_id || '') === pid) || null
}

function effectiveStatusForPersonel(task, personelId) {
  const mine = getPersonelRowInGroup(task, personelId)
  if (mine) return normalizeTaskStatus(mine.durum)
  return normalizeTaskStatus(task?.durum)
}

function isWorkableAssigneeStatus(durum) {
  const d = normalizeTaskStatus(durum)
  if (!d || isApprovedTaskStatus(d)) return false
  if (isPendingApprovalTaskStatus(d)) return false
  return (
    d === TASK_STATUS.ASSIGNED ||
    d === TASK_STATUS.REJECTED ||
    String(d).toLowerCase().includes('redd')
  )
}

/**
 * Zincir / sıralı adımlardan türetilen çalışma eylemi.
 * @returns {{ show: boolean, href: string, label: string } | null}
 */
export function resolveChainWorkAction(task, personelId, stepsForTask = []) {
  const pid = String(personelId || '')
  if (!pid || !task?.id || !Array.isArray(stepsForTask)) return null

  const tur = task.gorev_turu
  const taskId = String(task.id)
  const hrefDetail = `/admin/tasks/${taskId}`
  const hrefComplete = `/admin/tasks/${taskId}/complete`

  if (isSiraliGorevTuru(tur)) {
    const activeNo = Number(task.zincir_aktif_adim || 1)
    const activeStep =
      stepsForTask.find((s) => String(s?.adim_durum || '') === 'aktif') ||
      stepsForTask.find((s) => Number(s?.adim_no) === activeNo)
    if (!activeStep) return null
    const stepDurum = String(activeStep?.adim_durum || activeStep?.durum || '').toLowerCase()
    if (
      stepDurum === 'aktif' &&
      String(activeStep?.personel_id || '') === pid &&
      Number(activeStep?.adim_no) === activeNo
    ) {
      return { show: true, href: hrefComplete, label: 'Görevi yap' }
    }
    if (
      stepDurum === 'onay_bekliyor' &&
      String(activeStep?.denetimci_personel_id || '') === pid &&
      Number(activeStep?.adim_no) === activeNo
    ) {
      return { show: true, href: hrefDetail, label: 'Görevi yap' }
    }
    return null
  }

  if (isZincirGorevTuru(tur)) {
    const activeNo = Number(task.zincir_aktif_adim || 1)
    const myStep = stepsForTask.find(
      (s) =>
        String(s?.personel_id || '') === pid &&
        Number(s?.adim_no) === activeNo &&
        ['aktif', 'bekliyor', 'sira_bekliyor'].includes(
          String(s?.adim_durum || s?.durum || '').toLowerCase(),
        ),
    )
    if (myStep) return { show: true, href: hrefComplete, label: 'Görevi yap' }
    return null
  }

  if (isZincirOnayTuru(tur)) {
    const workerPhase =
      String(task?.sorumlu_personel_id || '') === pid &&
      isWorkableAssigneeStatus(task?.durum)
    if (workerPhase) return { show: true, href: hrefComplete, label: 'Görevi yap' }
    const activeNo = Number(task.zincir_onay_aktif_adim || 1)
    const pendingApprover = stepsForTask.find(
      (s) =>
        String(s?.onaylayici_personel_id || '') === pid &&
        String(s?.durum || '').toLowerCase() === 'bekliyor' &&
        Number(s?.adim_no) === activeNo,
    )
    if (pendingApprover) return { show: true, href: hrefDetail, label: 'Görevi yap' }
  }

  return null
}

/**
 * Liste / kart için: kullanıcı bu görevi şimdi yapabilir mi?
 */
export function getTaskWorkAction(task, personelId, chainSteps = null) {
  if (!task || !personelId) return null
  if (!isTaskVisibleNow(task)) return null

  const status = effectiveStatusForPersonel(task, personelId)
  if (isApprovedTaskStatus(status)) return null

  const tur = task.gorev_turu
  const chainTyped =
    isSiraliGorevTuru(tur) || isZincirGorevTuru(tur) || isZincirOnayTuru(tur)

  if (chainTyped && Array.isArray(chainSteps)) {
    return resolveChainWorkAction(task, personelId, chainSteps)
  }

  if (chainTyped) {
    if (isTaskAssignedToPersonel(task, personelId) && isWorkableAssigneeStatus(status)) {
      return {
        show: true,
        href: `/admin/tasks/${task.id}/complete`,
        label: 'Görevi yap',
      }
    }
    return null
  }

  if (!isTaskAssignedToPersonel(task, personelId)) return null
  if (!isWorkableAssigneeStatus(status)) return null

  return {
    show: true,
    href: `/admin/tasks/${task.id}/complete`,
    label: 'Görevi yap',
  }
}
