import getSupabase from './supabaseClient.js'
import { isPermTruthy, normalizeRolePermissions } from './permissions.js'
import { restrictBirimlerQueryByHierarchy } from './supabaseScope.js'

const supabase = getSupabase()

export function buildBirimHierarchyCtx({ isSystemAdmin, personel, permissions }) {
  const flat = normalizeRolePermissions(permissions)
  const birimUnassigned =
    personel?.birim_id == null || String(personel.birim_id).trim() === ''
  const isTopCompanyScope =
    !!personel?.ana_sirket_id &&
    birimUnassigned &&
    (isSystemAdmin ||
      isPermTruthy(flat, 'is_admin') ||
      isPermTruthy(flat, 'is_manager') ||
      isPermTruthy(flat, 'sirket.yonet') ||
      isPermTruthy(flat, 'rol.yonet') ||
      isPermTruthy(flat, 'sube.yonet') ||
      isPermTruthy(flat, 'personel.yonet') ||
      isPermTruthy(flat, 'personel_yonet'))

  return {
    isSystemAdmin: !!isSystemAdmin,
    isTopCompanyScope,
    accessibleUnitIds: personel?.accessibleUnitIds || [],
    fallbackBirimId: personel?.birim_id ?? null,
  }
}

export async function fetchAnnouncementUnits({ anaSirketId, birimHierarchyCtx }) {
  if (!anaSirketId) return []
  let unitQuery = supabase
    .from('birimler')
    .select('id, birim_adi')
    .eq('ana_sirket_id', anaSirketId)
    .order('birim_adi', { ascending: true })
  unitQuery = restrictBirimlerQueryByHierarchy(unitQuery, birimHierarchyCtx)
  const { data, error } = await unitQuery
  if (error) throw error
  return (data || []).map((u) => ({
    id: u.id,
    name: u.birim_adi || 'Birim',
  }))
}

async function resolveTargetPersonelIds(anaSirketId, unitIds) {
  const normalizedUnitIds = (unitIds || [])
    .map((id) => String(id || '').trim())
    .filter(Boolean)
  if (!normalizedUnitIds.length) return []

  const { data: byPrimary } = await supabase
    .from('personeller')
    .select('id')
    .eq('ana_sirket_id', anaSirketId)
    .in('birim_id', normalizedUnitIds)
    .is('silindi_at', null)

  let byJunction = []
  const jRes = await supabase
    .from('personel_birimleri')
    .select('personel_id')
    .eq('ana_sirket_id', anaSirketId)
    .in('birim_id', normalizedUnitIds)

  const jMissing =
    jRes.error &&
    (jRes.error.code === '42P01' ||
      jRes.error.code === 'PGRST205' ||
      String(jRes.error.message || '')
        .toLowerCase()
        .includes('personel_birimleri'))

  if (!jRes.error && Array.isArray(jRes.data)) byJunction = jRes.data
  else if (!jMissing && jRes.error) {
    console.warn('[duyuru] personel_birimleri:', jRes.error.message)
  }

  return [
    ...new Set(
      [...(byPrimary || []), ...byJunction]
        .map((r) => r.personel_id ?? r.id)
        .filter(Boolean)
        .map(String),
    ),
  ]
}

async function fetchExpoPushTokens(targetIds) {
  for (const tokenCol of ['expo_push_token', 'push_token', 'bildirim_tokeni']) {
    try {
      const { data } = await supabase
        .from('personeller')
        .select(`id, ${tokenCol}`)
        .in('id', targetIds)
      if (Array.isArray(data)) {
        const rows = data
          .map((r) => ({ id: r.id, token: r[tokenCol] }))
          .filter((r) => typeof r.token === 'string' && r.token.startsWith('ExponentPushToken'))
        if (rows.length) return rows
      }
    } catch {
      // try next column
    }
  }
  return []
}

async function sendExpoPush(tokenRows, text, fromPersonelId) {
  const pushPayload = tokenRows.map((r) => ({
    to: r.token,
    sound: 'default',
    title: 'Yeni Duyuru',
    body: text,
    data: { type: 'announcement', from_personel_id: fromPersonelId },
  }))
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(pushPayload),
  })
  return res.ok
}

/**
 * @returns {{ pushSent: number, pushSkipped: boolean }}
 */
export async function createAnnouncement({
  anaSirketId,
  gonderenPersonelId,
  metin,
  hedefBirimIds,
}) {
  const text = String(metin || '').trim()
  if (!text) throw new Error('Duyuru metni boş olamaz.')
  if (!anaSirketId || !gonderenPersonelId) {
    throw new Error('Oturum bilgisi eksik.')
  }

  const normalizedUnitIds = (hedefBirimIds || [])
    .map((id) => String(id || '').trim())
    .filter(Boolean)
  if (!normalizedUnitIds.length) {
    throw new Error('En az bir birim seçmelisiniz.')
  }

  const targetIds = await resolveTargetPersonelIds(anaSirketId, normalizedUnitIds)
  if (!targetIds.length) {
    throw new Error('Seçilen birimlerde kullanıcı bulunamadı.')
  }

  const { error: insertError } = await supabase.from('duyurular').insert({
    ana_sirket_id: anaSirketId,
    gonderen_personel_id: gonderenPersonelId,
    metin: text,
    hedef_birim_ids: normalizedUnitIds,
  })
  if (insertError) {
    throw new Error(insertError.message || 'Duyuru kaydedilemedi.')
  }

  const tokenRows = await fetchExpoPushTokens(targetIds)
  if (!tokenRows.length) {
    return { pushSent: 0, pushSkipped: true }
  }

  try {
    const ok = await sendExpoPush(tokenRows, text, gonderenPersonelId)
    return { pushSent: ok ? tokenRows.length : 0, pushSkipped: !ok }
  } catch {
    return { pushSent: 0, pushSkipped: true }
  }
}

export const ANNOUNCEMENTS_CHANGED_EVENT = 'pods:announcements-changed'

export function notifyAnnouncementsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ANNOUNCEMENTS_CHANGED_EVENT))
  }
}
