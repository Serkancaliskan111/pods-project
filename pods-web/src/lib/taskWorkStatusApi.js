import getSupabase from './supabaseClient.js'
import { normalizeTaskWorkStatus } from './taskWorkStatus.js'

const supabase = getSupabase()

export async function updateTaskWorkStatus(taskId, newStatus) {
  const status = normalizeTaskWorkStatus(newStatus)
  const { data, error } = await supabase.rpc('rpc_gorev_calisma_durumu_guncelle', {
    p_is_id: taskId,
    p_yeni_durum: status,
  })
  if (error) throw error
  return data
}

export async function fetchWorkStatusNotifications(personelId, limit = 40) {
  if (!personelId) return []
  const { data, error } = await supabase
    .from('gorev_calisma_durumu_bildirimleri')
    .select(
      'id,is_id,gorev_baslik,eski_calisma_durumu,yeni_calisma_durumu,degistiren_ad,okundu_at,created_at',
    )
    .eq('alici_personel_id', personelId)
    .is('okundu_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return []
    throw error
  }
  return data || []
}

export async function markWorkStatusNotificationRead(notificationId, personelId) {
  if (!notificationId || !personelId) return
  const { error } = await supabase
    .from('gorev_calisma_durumu_bildirimleri')
    .update({ okundu_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('alici_personel_id', personelId)
  if (error) throw error
}
