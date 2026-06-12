import getSupabase from './supabaseClient'
import { normalizeChatUploadContentType } from './chatAttachmentTypes.js'

/** Varsayılan mesaj sayfası; liste yenileme ve oda ilk yüklemede ortak. */
export const CHAT_MESSAGES_PAGE_SIZE = 80

/** Sohbet listesi üst sınırı (tek sorgu). */
export const CHAT_CHANNELS_LIMIT = 100

/** Kanal listesi Realtime tetikleyici debounce (ms). */
export const CHAT_REALTIME_LIST_DEBOUNCE_MS = 500

/** Uygulama/sekme tekrar aktif olunca mesaj yenileme debounce (ms). */
export const CHAT_RESYNC_DEBOUNCE_MS = 650

/** Üstten “daha eski” yüklemede tek istekte çekilecek mesaj sayısı. */
export const CHAT_OLDER_MESSAGES_BATCH = 40

/** Storage bucket (042_chat_mesaj_medya_bucket.sql). */
export const CHAT_ATTACHMENTS_BUCKET = 'chat-ekleri'
export const CHAT_PRESENCE_FRESH_MS = 90 * 1000

const CHAT_MESSAGE_COLUMNS =
  'id, kanal_id, gonderen_kullanici_id, icerik, olusturulma_at, silindi_at, mesaj_tipi, ek_yol, ek_orijinal_ad, ek_mime, ek_boyut'

/** 036 şeması (042 chat medya migration öncesi). */
const LEGACY_CHAT_MESSAGE_COLUMNS =
  'id, kanal_id, gonderen_kullanici_id, icerik, olusturulma_at, silindi_at'

const CHAT_CHANNEL_BASE_COLUMNS =
  'id, tur, baslik, dm_user_low, dm_user_high, ana_sirket_id, son_mesaj_at, son_mesaj_ozet'

const CHAT_CHANNEL_EXT_COLUMNS = `${CHAT_CHANNEL_BASE_COLUMNS}, created_at, olusturan_kullanici_id`

function normalizeLegacyChatMessageRows(rows) {
  return (rows || []).map((r) => ({
    ...r,
    mesaj_tipi: 'text',
    ek_yol: null,
    ek_orijinal_ad: null,
    ek_mime: null,
    ek_boyut: null,
  }))
}

/** Postgres undefined_column veya PostgREST “does not exist” metni. */
function isChatMediaSchemaMissingError(error) {
  const code = error?.code
  const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase()
  if (code === '42703') return true
  return (
    msg.includes('mesaj_tipi') ||
    msg.includes('ek_yol') ||
    (msg.includes('column') && msg.includes('does not exist'))
  )
}

function isMissingColumnError(error, columnName) {
  const code = String(error?.code || '')
  const msg = String(error?.message || error?.details || '').toLowerCase()
  const missingColumnLike =
    (code === '42703' && msg.includes('column')) ||
    msg.includes('does not exist') ||
    msg.includes('could not find the') ||
    msg.includes('schema cache')
  if (!missingColumnLike) return false
  if (!columnName) return true
  return msg.includes(String(columnName || '').toLowerCase())
}

function newChatObjectKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

/** Kanal / kullanıcı UUID’lerini tek forma getirir (Map anahtarı ve eq filtre uyumu). */
export function normalizeChatUuid(id) {
  const s = String(id ?? '').trim()
  return s ? s.toLowerCase() : ''
}

export function isChatPresenceFresh(lastSeenAt, nowMs = Date.now()) {
  const t = lastSeenAt ? new Date(lastSeenAt).getTime() : 0
  return !!t && nowMs - t < CHAT_PRESENCE_FRESH_MS
}

/** Mesajları id’ye göre artan sırala (Realtime ile eklerken sıra bozulmasın). */
export function sortMessagesByIdAsc(rows) {
  if (!rows?.length) return []
  return rows.slice().sort((a, b) => {
    try {
      const da = BigInt(String(a.id))
      const db = BigInt(String(b.id))
      if (da < db) return -1
      if (da > db) return 1
      return 0
    } catch {
      return Number(a.id) - Number(b.id)
    }
  })
}

async function fetchMyChannelsFallback(supabase, uidNorm) {
  const { data: memberships, error: e1 } = await supabase
    .from('sohbet_uyeleri')
    .select('kanal_id, son_okunan_mesaj_id, son_okuma_at')
    .eq('kullanici_id', uidNorm)

  if (e1) throw e1
  const memberMap = new Map(
    (memberships || []).map((m) => [normalizeChatUuid(m.kanal_id), m]),
  )
  const kanalIds = [...memberMap.keys()]
  if (!kanalIds.length) return []

  const { data: channels, error: e2 } = await supabase
    .from('sohbet_kanallari')
    .select(CHAT_CHANNEL_EXT_COLUMNS)
    .in('id', kanalIds)
  let channelsData = channels
  if (e2) {
    if (isMissingColumnError(e2)) {
      const retry = await supabase
        .from('sohbet_kanallari')
        .select(CHAT_CHANNEL_BASE_COLUMNS)
        .in('id', kanalIds)
      if (retry.error) throw retry.error
      channelsData = retry.data
    } else {
      throw e2
    }
  }

  const merged = (channelsData || []).map((k) => ({
    ...k,
    _membership: memberMap.get(normalizeChatUuid(k.id)),
  }))
  merged.sort((a, b) => {
    const ta = a.son_mesaj_at ? new Date(a.son_mesaj_at).getTime() : 0
    const tb = b.son_mesaj_at ? new Date(b.son_mesaj_at).getTime() : 0
    return tb - ta
  })
  return merged
}

/**
 * Üyelik + kanal birleşimi.
 * Önce tek round-trip (!inner); şema/PostgREST uyumsuzluğunda iki sorguya düşer.
 */
export async function fetchMyChannels(userId) {
  const supabase = getSupabase()
  const uidNorm = normalizeChatUuid(userId)
  if (!uidNorm) return []

  const runMain = (cols) =>
    supabase
      .from('sohbet_kanallari')
      .select(`${cols}, sohbet_uyeleri!inner(kullanici_id, son_okunan_mesaj_id, son_okuma_at)`)
      .eq('sohbet_uyeleri.kullanici_id', uidNorm)
      .order('son_mesaj_at', { ascending: false, nullsFirst: false })
      .limit(CHAT_CHANNELS_LIMIT)
  let { data, error } = await runMain(CHAT_CHANNEL_EXT_COLUMNS)
  if (error && isMissingColumnError(error)) {
    const retry = await runMain(CHAT_CHANNEL_BASE_COLUMNS)
    data = retry.data
    error = retry.error
  }

  if (!error && Array.isArray(data)) {
    return data.map((row) => {
      const raw = row.sohbet_uyeleri
      const uyeler = Array.isArray(raw) ? raw : raw ? [raw] : []
      const mine =
        uyeler.find((u) => normalizeChatUuid(u.kullanici_id) === uidNorm) || uyeler[0]
      const { sohbet_uyeleri: _u, ...kanal } = row
      return {
        ...kanal,
        _membership: {
          kanal_id: kanal.id,
          son_okunan_mesaj_id: mine?.son_okunan_mesaj_id ?? null,
          son_okuma_at: mine?.son_okuma_at ?? null,
        },
      }
    })
  }

  return fetchMyChannelsFallback(supabase, uidNorm)
}

export function channelLooksUnread(channel) {
  const m = channel?._membership
  if (!m || !channel?.son_mesaj_at) return false
  if (!m.son_okuma_at) return true
  return new Date(channel.son_mesaj_at) > new Date(m.son_okuma_at)
}

export async function resolveChannelTitles(channels, myUserId, anaSirketId) {
  const me = normalizeChatUuid(myUserId)
  const dmPeers = []
  const groupCreators = []
  for (const c of channels) {
    if (c.tur === 'birebir') {
      const low = normalizeChatUuid(c.dm_user_low)
      const other = low === me ? c.dm_user_high : c.dm_user_low
      if (other) dmPeers.push(other)
    } else if (c.tur === 'grup' && c.olusturan_kullanici_id) {
      groupCreators.push(c.olusturan_kullanici_id)
    }
  }
  const uniq = [...new Set(dmPeers)]
  const uniqCreators = [...new Set(groupCreators.map(normalizeChatUuid).filter(Boolean))]
  const nameByUser = {}
  if (uniq.length && anaSirketId) {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('personeller')
      .select('kullanici_id, ad, soyad')
      .eq('ana_sirket_id', anaSirketId)
      .in('kullanici_id', uniq)
    ;(data || []).forEach((p) => {
      const n = `${p.ad || ''} ${p.soyad || ''}`.trim()
      nameByUser[normalizeChatUuid(p.kullanici_id)] = n || 'Personel'
    })
  }
  const creatorNameByUser = {}
  if (uniqCreators.length && anaSirketId) {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('personeller')
      .select('kullanici_id, ad, soyad')
      .eq('ana_sirket_id', anaSirketId)
      .in('kullanici_id', uniqCreators)
    ;(data || []).forEach((p) => {
      const n = `${p.ad || ''} ${p.soyad || ''}`.trim()
      creatorNameByUser[normalizeChatUuid(p.kullanici_id)] = n || ''
    })
  }
  const missingCreatorIds = uniqCreators.filter((id) => !creatorNameByUser[id])
  if (missingCreatorIds.length) {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('kullanicilar')
      .select('id, ad, soyad, ad_soyad')
      .in('id', missingCreatorIds)
    ;(data || []).forEach((u) => {
      const n = `${u.ad || ''} ${u.soyad || ''}`.trim() || String(u.ad_soyad || '').trim()
      creatorNameByUser[normalizeChatUuid(u.id)] = n || ''
    })
  }
  return channels.map((c) => {
    if (c.tur === 'grup') {
      const creatorName = creatorNameByUser[normalizeChatUuid(c.olusturan_kullanici_id)] || ''
      return {
        ...c,
        displayTitle: (c.baslik || '').trim() || 'Grup',
        groupCreatorName: creatorName,
      }
    }
    const low = normalizeChatUuid(c.dm_user_low)
    const other = low === me ? c.dm_user_high : c.dm_user_low
    return { ...c, displayTitle: nameByUser[normalizeChatUuid(other)] || 'Sohbet' }
  })
}

export async function fetchCompanyPeersForChat(anaSirketId, excludeKullaniciId) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('personeller')
    .select('id, ad, soyad, kullanici_id, email')
    .eq('ana_sirket_id', anaSirketId)
    .is('silindi_at', null)
    .neq('kullanici_id', excludeKullaniciId)
    .order('ad', { ascending: true })
    .limit(500)

  if (error) throw error
  return data || []
}

export async function fetchUserProfileMeta(userIds) {
  const ids = [...new Set((userIds || []).map(normalizeChatUuid).filter(Boolean))]
  if (!ids.length) return {}
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('kullanicilar')
    .select('id, avatar_id, profil_foto_yol')
    .in('id', ids)
  if (error) {
    if (error.code === '42703') return {}
    throw error
  }
  const map = {}
  for (const row of data || []) {
    const uid = normalizeChatUuid(row?.id)
    if (!uid) continue
    map[uid] = {
      avatarId: row?.avatar_id || null,
      photoPath: row?.profil_foto_yol || null,
    }
  }
  return map
}

/** @deprecated Yeni kod için fetchUserProfileMeta kullanın. */
export async function fetchUserAvatarIds(userIds) {
  const meta = await fetchUserProfileMeta(userIds)
  const map = {}
  for (const [uid, row] of Object.entries(meta)) {
    map[uid] = row?.avatarId ?? null
  }
  return map
}

export async function rpcStartDm(peerKullaniciId) {
  const peer = normalizeChatUuid(peerKullaniciId)
  if (!peer) {
    const err = new Error('Geçersiz kullanıcı')
    throw err
  }

  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('chat_baslat_birebir', {
    p_alici_kullanici_id: peer,
  })
  if (error) throw error
  return data
}

export async function rpcCreateGroup(title, memberKullaniciIds) {
  const uuids = (memberKullaniciIds || []).map(normalizeChatUuid).filter(Boolean)

  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('chat_grup_olustur', {
    p_baslik: title,
    p_uye_kullanici_idleri: uuids,
  })
  if (error) throw error
  return data
}

export async function fetchMessages(kanalId, { beforeId, limit = CHAT_MESSAGES_PAGE_SIZE } = {}) {
  const cid = normalizeChatUuid(kanalId)
  if (!cid) return []

  const supabase = getSupabase()
  const runSelect = (cols) => {
    let q = supabase
      .from('sohbet_mesajlari')
      .select(cols)
      .eq('kanal_id', cid)
      .is('silindi_at', null)
      .order('id', { ascending: false })
      .limit(limit)
    if (beforeId != null) q = q.lt('id', beforeId)
    return q
  }

  let { data, error } = await runSelect(CHAT_MESSAGE_COLUMNS)
  if (error && isChatMediaSchemaMissingError(error)) {
    const retry = await runSelect(LEGACY_CHAT_MESSAGE_COLUMNS)
    data = retry.data
    error = retry.error
    if (!error) data = normalizeLegacyChatMessageRows(data)
  }
  if (error) throw error
  return (data || []).slice().reverse()
}

/**
 * @param {object | null} attachmentMeta — DB’ye yazılacak ek (yükledikten sonra).
 *   { mesaj_tipi, ek_yol, ek_orijinal_ad?, ek_mime?, ek_boyut? }
 */
function isTransientChatSendError(error) {
  const msg = String(error?.message || error?.details || '').toLowerCase()
  const code = String(error?.code || '')
  return (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('aborted') ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT'
  )
}

export async function sendMessage(kanalId, text, attachmentMeta = null) {
  const cid = normalizeChatUuid(kanalId)
  if (!cid) {
    const err = new Error('Geçersiz kanal')
    throw err
  }

  const supabase = getSupabase()
  const body = String(text ?? '').trim()
  const hasAtt = !!(attachmentMeta && attachmentMeta.ek_yol)
  const rpcArgs = hasAtt
    ? {
        p_kanal_id: cid,
        p_icerik: body,
        p_mesaj_tipi: attachmentMeta.mesaj_tipi || 'file',
        p_ek_yol: attachmentMeta.ek_yol,
        p_ek_orijinal_ad: attachmentMeta.ek_orijinal_ad ?? null,
        p_ek_mime: attachmentMeta.ek_mime ?? null,
        p_ek_boyut: attachmentMeta.ek_boyut ?? null,
      }
    : { p_kanal_id: cid, p_icerik: body }

  const maxAttempts = hasAtt ? 2 : 4
  let lastError
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await supabase.rpc('chat_mesaj_gonder', rpcArgs)
    if (!error) return data
    lastError = error
    if (!isTransientChatSendError(error) || attempt === maxAttempts - 1) throw error
    await new Promise((r) => setTimeout(r, 400 + attempt * 350))
  }
  throw lastError
}

export function sanitizeChatStorageFileName(name) {
  const raw = String(name || 'dosya')
  const s = raw
    .split('')
    .map((ch) => {
      const c = ch.charCodeAt(0)
      if (c < 32 || '/\\<>|:"'.includes(ch)) return '_'
      return ch
    })
    .join('')
    .trim()
    .slice(0, 160)
  return s || 'dosya'
}

/** Kanal klasörü altına yükle; RLS ilk segment’in kanal_id olmasını bekler. */
export async function uploadChatBlob(channelId, data, { contentType, fileName } = {}) {
  const cid = normalizeChatUuid(channelId)
  if (!cid) throw new Error('Geçersiz kanal')

  const supabase = getSupabase()
  const safe = sanitizeChatStorageFileName(fileName)
  const path = `${cid}/${newChatObjectKey()}_${safe}`
  const mime = normalizeChatUploadContentType(contentType, fileName)
  const { error } = await supabase.storage.from(CHAT_ATTACHMENTS_BUCKET).upload(path, data, {
    contentType: mime,
    upsert: false,
  })
  if (error) throw error
  return {
    ek_yol: path,
    ek_orijinal_ad: safe,
    ek_mime: mime,
    ek_boyut: typeof data?.size === 'number' ? data.size : null,
  }
}

export async function createChatAttachmentSignedUrl(storagePath, expiresSec = 3600, options = {}) {
  const supabase = getSupabase()
  const { download } = options
  const signedOpts =
    download != null && download !== false
      ? { download: typeof download === 'string' ? download : true }
      : undefined
  const { data, error } = await supabase.storage
    .from(CHAT_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresSec, signedOpts)
  if (error) throw error
  return data?.signedUrl ?? null
}

export function inferMesajTipiFromMime(mime) {
  const m = String(mime || '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  return 'file'
}

export async function fetchChannelMemberReadStates(kanalId) {
  const cid = normalizeChatUuid(kanalId)
  if (!cid) return []

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('sohbet_uyeleri')
    .select('kullanici_id, son_okunan_mesaj_id')
    .eq('kanal_id', cid)

  if (error) throw error
  return data || []
}

export async function fetchPeersPresenceMap(anaSirketId, kullaniciIds) {
  const ids = [...new Set((kullaniciIds || []).map(normalizeChatUuid).filter(Boolean))]
  if (!ids.length || !anaSirketId) return {}

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('personeller')
    .select('kullanici_id, mobil_online, mobil_last_seen_at')
    .eq('ana_sirket_id', anaSirketId)
    .in('kullanici_id', ids)
    .is('silindi_at', null)

  if (error) throw error
  const map = {}
  for (const r of data || []) {
    const lastSeenAt = r.mobil_last_seen_at ?? null
    map[normalizeChatUuid(r.kullanici_id)] = {
      mobil_online: !!r.mobil_online && isChatPresenceFresh(lastSeenAt),
      mobil_last_seen_at: lastSeenAt,
    }
  }
  return map
}

/** DM için karşı üyenin son_okunan_mesaj_id üst sınırı (tek rakip varsayımı). */
export function maxPeerReadMessageId(memberRows, myUserId) {
  const me = normalizeChatUuid(myUserId)
  let max = null
  for (const r of memberRows || []) {
    if (normalizeChatUuid(r.kullanici_id) === me) continue
    const id = r.son_okunan_mesaj_id
    if (id == null) continue
    try {
      const bi = BigInt(String(id))
      if (max == null || bi > BigInt(String(max))) max = id
    } catch {
      const n = Number(id)
      const cm = max == null ? -1 : Number(max)
      if (max == null || n > cm) max = id
    }
  }
  return max
}

function messageIdAtLeast(readId, msgId) {
  if (readId == null || msgId == null) return false
  try {
    return BigInt(String(readId)) >= BigInt(String(msgId))
  } catch {
    return Number(readId) >= Number(msgId)
  }
}

/**
 * DM ve grup için tik durumu: sent (tek), delivered (çift gri), read (çift mavi).
 * Grup: tüm üyeler okuduysa mavi; en az biri okuduysa gri çift tik.
 */
export function computeMessageReadReceipt(msgId, memberRows, myUserId) {
  const me = normalizeChatUuid(myUserId)
  const peers = (memberRows || []).filter((r) => {
    const uid = normalizeChatUuid(r?.kullanici_id)
    return uid && uid !== me
  })

  if (!peers.length) {
    return { state: 'sent', read: false, title: 'Gönderildi', ticks: '✓' }
  }

  let readCount = 0
  for (const r of peers) {
    if (messageIdAtLeast(r.son_okunan_mesaj_id, msgId)) readCount += 1
  }

  if (readCount === 0) {
    return { state: 'sent', read: false, title: 'Gönderildi', ticks: '✓' }
  }
  if (readCount === peers.length) {
    return {
      state: 'read',
      read: true,
      title: peers.length === 1 ? 'Görüldü' : 'Herkes gördü',
      ticks: '✓✓',
    }
  }
  return {
    state: 'delivered',
    read: false,
    title: peers.length === 1 ? 'İletildi' : `${readCount}/${peers.length} gördü`,
    ticks: '✓✓',
  }
}

export function subscribeMembershipReadStates(kanalId, onRow) {
  const supabase = getSupabase()
  const cid = normalizeChatUuid(kanalId)
  if (!cid) return () => {}

  const ch = supabase
    .channel(`sohbet-read:${cid}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'sohbet_uyeleri',
        filter: `kanal_id=eq.${cid}`,
      },
      (payload) => onRow?.(payload.new),
    )
    .subscribe()

  return () => {
    try {
      supabase.removeChannel(ch)
    } catch {
      /* ignore */
    }
  }
}

export function subscribePeerPresenceRow(kullaniciId, onRow) {
  const supabase = getSupabase()
  const uid = normalizeChatUuid(kullaniciId)
  if (!uid) return () => {}

  const ch = supabase
    .channel(`personel-pres:${uid}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'personeller',
        filter: `kullanici_id=eq.${uid}`,
      },
      (payload) => onRow?.(payload.new),
    )
    .subscribe()

  return () => {
    try {
      supabase.removeChannel(ch)
    } catch {
      /* ignore */
    }
  }
}

export async function markRead(kanalId, mesajId) {
  const cid = normalizeChatUuid(kanalId)
  if (!cid) return

  const supabase = getSupabase()
  const { error } = await supabase.rpc('chat_okundu_isaretle', {
    p_kanal_id: cid,
    p_mesaj_id: mesajId,
  })
  if (error) throw error
}

export function subscribeChannelSummaries(channelIds, onEvent) {
  const supabase = getSupabase()
  const cleaned = [...new Set((channelIds || []).map(normalizeChatUuid).filter(Boolean))].slice(
    0,
    32,
  )
  const regs = cleaned.map((cid) =>
    supabase
      .channel(`sohbet-k-${cid}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sohbet_kanallari',
          filter: `id=eq.${cid}`,
        },
        () => onEvent?.({ kanalId: cid }),
      )
      .subscribe(),
  )

  return () => {
    regs.forEach((ch) => {
      try {
        supabase.removeChannel(ch)
      } catch {
        /* ignore */
      }
    })
  }
}

export function subscribeRoomInserts(kanalId, onInsert) {
  const supabase = getSupabase()
  const cid = normalizeChatUuid(kanalId)
  if (!cid) return () => {}
  const ch = supabase
    .channel(`sohbet-room-msg:${cid}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'sohbet_mesajlari',
        filter: `kanal_id=eq.${cid}`,
      },
      (payload) => onInsert?.(payload.new),
    )
    .subscribe((status, err) => {
      if (import.meta.env?.DEV && status !== 'SUBSCRIBED') {
        console.warn('[sohbet realtime]', status, err?.message || err || '')
      }
    })

  return () => {
    try {
      supabase.removeChannel(ch)
    } catch {
      /* ignore */
    }
  }
}

export async function fetchChannelMembers(kanalId, anaSirketId) {
  const cid = normalizeChatUuid(kanalId)
  if (!cid) return []
  const supabase = getSupabase()
  const { data: members, error: memberErr } = await supabase
    .from('sohbet_uyeleri')
    .select('kullanici_id')
    .eq('kanal_id', cid)
  if (memberErr) throw memberErr
  const ids = [...new Set((members || []).map((m) => normalizeChatUuid(m.kullanici_id)).filter(Boolean))]
  if (!ids.length) return []
  let q = supabase.from('personeller').select('kullanici_id, ad, soyad').in('kullanici_id', ids)
  if (anaSirketId) q = q.eq('ana_sirket_id', anaSirketId)
  const { data: persons, error: pErr } = await q
  if (pErr) throw pErr
  const nameById = {}
  for (const p of persons || []) {
    const k = normalizeChatUuid(p.kullanici_id)
    if (!k) continue
    nameById[k] = `${p.ad || ''} ${p.soyad || ''}`.trim() || null
  }
  return ids.map((id) => ({
    kullanici_id: id,
    ad_soyad: nameById[id] || `Kullanıcı ${id.slice(0, 8)}`,
  }))
}

export async function fetchKanal(kanalId) {
  const cid = normalizeChatUuid(kanalId)
  if (!cid) return null

  const supabase = getSupabase()
  const run = (cols) => supabase.from('sohbet_kanallari').select(cols).eq('id', cid).maybeSingle()
  let { data, error } = await run(CHAT_CHANNEL_EXT_COLUMNS)
  if (error && isMissingColumnError(error)) {
    const retry = await run(CHAT_CHANNEL_BASE_COLUMNS)
    data = retry.data
    error = retry.error
  }
  if (error) throw error
  return data
}
