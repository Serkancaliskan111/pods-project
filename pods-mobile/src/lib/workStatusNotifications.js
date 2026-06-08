import { taskWorkStatusLabel } from './taskWorkStatus.js'

/**
 * @param {Array<object>} rows - gorev_calisma_durumu_bildirimleri
 */
export function mapWorkStatusNotifications(rows) {
  return (rows || []).map((row) => {
    const yeni = taskWorkStatusLabel(row.yeni_calisma_durumu)
    const eski = row.eski_calisma_durumu
      ? taskWorkStatusLabel(row.eski_calisma_durumu)
      : null
    const who = row.degistiren_ad?.trim() || 'Personel'
    const detail = eski
      ? `${who}: ${eski} → ${yeni}`
      : `${who}: ${yeni}`
    return {
      id: `wsn:${row.id}`,
      dbId: row.id,
      type: 'work_status_changed',
      title: 'Görev durumu güncellendi',
      detail: `${row.gorev_baslik || 'Görev'} · ${detail}`,
      href: `/admin/tasks/${row.is_id}`,
      tone: 'info',
      at: row.created_at,
      sortKey: row.created_at ? new Date(row.created_at).getTime() : 0,
      persistRead: true,
    }
  })
}
