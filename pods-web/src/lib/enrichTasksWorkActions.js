import {
  isSiraliGorevTuru,
  isZincirGorevTuru,
  isZincirOnayTuru,
} from './zincirTasks.js'
import { getTaskWorkAction } from './taskWorkEligibility.js'

function isChainTask(task) {
  const t = task?.gorev_turu
  return isSiraliGorevTuru(t) || isZincirGorevTuru(t) || isZincirOnayTuru(t)
}

/**
 * Görev listesine zincir/sıralı adım bilgisi ekleyerek "Görevi yap" kararını destekler.
 */
export async function enrichTasksWithWorkActions(client, tasks, personelId) {
  const list = Array.isArray(tasks) ? tasks : []
  const pid = String(personelId || '')
  if (!pid || !list.length) return list

  const chainIds = list.filter(isChainTask).map((t) => t.id).filter(Boolean)
  const stepsByTaskId = new Map()

  if (chainIds.length) {
    const [gorevRes, onayRes] = await Promise.all([
      client
        .from('isler_zincir_gorev_adimlari')
        .select('is_id, adim_no, adim_durum, durum, personel_id, denetimci_personel_id')
        .in('is_id', chainIds)
        .or(`personel_id.eq.${pid},denetimci_personel_id.eq.${pid}`),
      client
        .from('isler_zincir_onay_adimlari')
        .select('is_id, adim_no, durum, onaylayici_personel_id')
        .in('is_id', chainIds)
        .eq('onaylayici_personel_id', pid),
    ])

    for (const row of gorevRes?.data || []) {
      const key = String(row.is_id)
      const arr = stepsByTaskId.get(key) || []
      arr.push({ ...row, _kind: 'gorev' })
      stepsByTaskId.set(key, arr)
    }
    for (const row of onayRes?.data || []) {
      const key = String(row.is_id)
      const arr = stepsByTaskId.get(key) || []
      arr.push({ ...row, _kind: 'onay' })
      stepsByTaskId.set(key, arr)
    }
  }

  return list.map((task) => {
    const steps = stepsByTaskId.get(String(task.id)) || null
    const workAction = getTaskWorkAction(task, pid, steps)
    return workAction ? { ...task, workAction } : task
  })
}
