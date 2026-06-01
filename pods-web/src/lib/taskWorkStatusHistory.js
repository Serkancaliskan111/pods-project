import { taskWorkStatusLabel } from './taskWorkStatus.js'

export const WORK_STATUS_HISTORY_SELECT =
  'id,is_id,eski_durum,yeni_durum,degistiren_personel_id,degistiren_ad,degistirme_at,onceki_durum_suresi_saniye'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} taskId
 */
export async function fetchTaskWorkStatusHistory(client, taskId) {
  if (!taskId) return []
  const { data, error } = await client
    .from('gorev_calisma_durumu_gecmisi')
    .select(WORK_STATUS_HISTORY_SELECT)
    .eq('is_id', taskId)
    .order('degistirme_at', { ascending: true })

  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return []
    throw error
  }
  return data || []
}

export function formatWorkStatusDuration(seconds) {
  const n = Number(seconds)
  if (!Number.isFinite(n) || n < 0) return null
  if (n < 60) return `${n} sn`
  const m = Math.floor(n / 60)
  if (m < 60) return `${m} dk`
  const h = Math.floor(m / 60)
  const rm = m % 60
  if (h < 24) return rm > 0 ? `${h} sa ${rm} dk` : `${h} sa`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh > 0 ? `${d} gün ${rh} sa` : `${d} gün`
}

/**
 * @param {object} row
 */
export function formatWorkStatusHistoryLine(row) {
  const at = row?.degistirme_at
    ? new Date(row.degistirme_at).toLocaleString('tr-TR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'
  const who = row?.degistiren_ad?.trim() || 'Personel'
  const from = taskWorkStatusLabel(row?.eski_durum)
  const to = taskWorkStatusLabel(row?.yeni_durum)
  const dur = formatWorkStatusDuration(row?.onceki_durum_suresi_saniye)
  const durPart = dur ? ` (${dur} süreyle ${from})` : ''
  return { at, text: `${who}: ${from} → ${to}${durPart}` }
}
