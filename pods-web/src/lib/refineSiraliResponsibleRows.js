import { isSiraliGorevTuru } from './zincirTasks.js'
import { isPendingApprovalTaskStatus } from './taskStatus.js'

/**
 * Sıralı görevde ana kayıt bazen yanlışlıkla sonraki adımın işçisine atanmış olabilir.
 * Yalnızca `sorumlu_personel_id === personelId` olan sıralı görevleri aktif adım satırına göre süzer.
 */
export async function refineSiraliResponsibleRows(rows, personelId, client) {
  if (!rows?.length || !personelId) return rows || []
  const mine = rows.filter(
    (t) =>
      isSiraliGorevTuru(t?.gorev_turu) &&
      String(t?.sorumlu_personel_id || '') === String(personelId || ''),
  )
  if (!mine.length) return rows

  const ids = [...new Set(mine.map((t) => t.id).filter(Boolean))]
  const { data: stepRows, error } = await client
    .from('isler_zincir_gorev_adimlari')
    .select('is_id, adim_no, personel_id, denetimci_personel_id, adim_durum, durum')
    .in('is_id', ids)

  if (error || !stepRows?.length) return rows

  const byKey = new Map()
  for (const s of stepRows) {
    if (!s?.is_id || s.adim_no == null) continue
    byKey.set(`${s.is_id}:${Number(s.adim_no)}`, s)
  }

  return rows.filter((task) => {
    if (!isSiraliGorevTuru(task?.gorev_turu)) return true
    if (String(task?.sorumlu_personel_id || '') !== String(personelId || '')) return true

    const adimNo = Number(task.zincir_aktif_adim) || 1
    const step = byKey.get(`${task.id}:${adimNo}`)
    if (!step) return true

    const pending = isPendingApprovalTaskStatus(task.durum)
    const st = String(step.adim_durum || step.durum || '').toLowerCase()

    if (pending) {
      if (step.denetimci_personel_id != null) {
        return String(step.denetimci_personel_id) === String(personelId)
      }
      return String(step.personel_id) === String(personelId)
    }

    if (String(step.personel_id) !== String(personelId)) return false
    if (st === 'sira_bekliyor') return false
    return true
  })
}
