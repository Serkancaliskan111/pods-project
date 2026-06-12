import * as FileSystem from 'expo-file-system'
import { decode as decodeBase64ArrayBuffer } from 'base64-arraybuffer'
import getSupabase from './supabaseClient'
import {
  chatUnsupportedFileMessage,
  isChatAttachmentAllowed,
  stripMimeParameters,
} from './chatAttachmentTypes'
import { formatForwardedMessageBody, parseChatMessageContent, formatReplyMessageBody } from './chatMessageContentParse'

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
  'id, kanal_id, gonderen_kullanici_id, icerik, olusturulma_at, silindi_at, mesaj_tipi, ek_yol, ek_orijinal_ad, ek_mime, ek_boyut, konum_lat, konum_lng, konum_etiket, ses_suresi_sn'

const LEGACY_CHAT_MESSAGE_COLUMNS =
  'id, kanal_id, gonderen_kullanici_id, icerik, olusturulma_at, silindi_at'

const CHAT_CHANNEL_BASE_COLUMNS =
  'id, tur, baslik, dm_user_low, dm_user_high, ana_sirket_id, son_mesaj_at, son_mesaj_ozet'

const CHAT_CHANNEL_EXT_COLUMNS = `${CHAT_CHANNEL_BASE_COLUMNS}, created_at, olusturan_kullanici_id`

function normalizeLegacyChatMessageRows(rows) {
  return (rows || []).map((r) => ({
    ...r,
    mesaj_tipi: r.mesaj_tipi || 'text',
    ek_yol: r.ek_yol ?? null,
    ek_orijinal_ad: r.ek_orijinal_ad ?? null,
    ek_mime: r.ek_mime ?? null,
    ek_boyut: r.ek_boyut ?? null,
    konum_lat: r.konum_lat ?? null,
    konum_lng: r.konum_lng ?? null,
    konum_etiket: r.konum_etiket ?? null,
    ses_suresi_sn: r.ses_suresi_sn ?? null,
  }))
}

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

function isChatExtendedSchemaMissingError(error) {
  const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase()
  return (
    isChatMediaSchemaMissingError(error) ||
    msg.includes('konum_lat') ||
    msg.includes('ses_suresi_sn')
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
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`
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
  if (uniq.length) {
    const supabase = getSupabase()
    let q = supabase.from('personeller').select('kullanici_id, ad, soyad').in('kullanici_id', uniq)
    if (anaSirketId) q = q.eq('ana_sirket_id', anaSirketId)
    const { data } = await q
    ;(data || []).forEach((p) => {
      const n = `${p.ad || ''} ${p.soyad || ''}`.trim()
      nameByUser[normalizeChatUuid(p.kullanici_id)] = n || 'Personel'
    })
  }
  const creatorNameByUser = {}
  if (uniqCreators.length) {
    const supabase = getSupabase()
    let q = supabase
      .from('personeller')
      .select('kullanici_id, ad, soyad')
      .in('kullanici_id', uniqCreators)
    if (anaSirketId) q = q.eq('ana_sirket_id', anaSirketId)
    const { data } = await q
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
      const creatorIdNorm = normalizeChatUuid(c.olusturan_kullanici_id)
      const fallbackCreator = ''
      return {
        ...c,
        displayTitle: (c.baslik || '').trim() || 'Grup',
        groupCreatorName: creatorNameByUser[creatorIdNorm] || fallbackCreator,
      }
    }
    const low = normalizeChatUuid(c.dm_user_low)
    const other = low === me ? c.dm_user_high : c.dm_user_low
    return { ...c, displayTitle: nameByUser[normalizeChatUuid(other)] || 'Sohbet' }
  })
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
  const { data: rows, error: rowErr } = await q
  if (rowErr) throw rowErr

  const nameById = {}
  for (const p of rows || []) {
    const k = normalizeChatUuid(p.kullanici_id)
    if (!k) continue
    nameById[k] = `${p.ad || ''} ${p.soyad || ''}`.trim() || null
  }
  const { data: allUsers } = await supabase
    .from('kullanicilar')
    .select('id, ad, soyad, ad_soyad, profil_foto_yol')
    .in('id', ids)
  const photoById = {}
  for (const u of allUsers || []) {
    const id = normalizeChatUuid(u.id)
    if (!id) continue
    if (!nameById[id]) {
      nameById[id] = `${u.ad || ''} ${u.soyad || ''}`.trim() || String(u.ad_soyad || '').trim() || null
    }
    if (u.profil_foto_yol) photoById[id] = u.profil_foto_yol
  }

  return ids.map((id) => ({
    kullanici_id: id,
    ad_soyad: nameById[id] || `Kullanıcı ${id.slice(0, 8)}`,
    profil_foto_yol: photoById[id] || null,
  }))
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
  if (error && isChatExtendedSchemaMissingError(error)) {
    const retry = await runSelect(LEGACY_CHAT_MESSAGE_COLUMNS)
    data = retry.data
    error = retry.error
    if (!error) data = normalizeLegacyChatMessageRows(data)
  }
  if (error) throw error
  return (data || []).slice().reverse()
}

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
  const tip = attachmentMeta?.mesaj_tipi
  const hasAtt = !!(attachmentMeta && attachmentMeta.ek_yol)
  const isLocation = tip === 'location'
  const rpcArgs = isLocation
    ? {
        p_kanal_id: cid,
        p_icerik: body,
        p_mesaj_tipi: 'location',
        p_konum_lat: attachmentMeta.konum_lat,
        p_konum_lng: attachmentMeta.konum_lng,
        p_konum_etiket: attachmentMeta.konum_etiket ?? null,
      }
    : hasAtt
      ? {
          p_kanal_id: cid,
          p_icerik: body,
          p_mesaj_tipi: attachmentMeta.mesaj_tipi || 'file',
          p_ek_yol: attachmentMeta.ek_yol,
          p_ek_orijinal_ad: attachmentMeta.ek_orijinal_ad ?? null,
          p_ek_mime: attachmentMeta.ek_mime ?? null,
          p_ek_boyut: attachmentMeta.ek_boyut ?? null,
          p_ses_suresi_sn:
            attachmentMeta.ses_suresi_sn != null ? Math.round(Number(attachmentMeta.ses_suresi_sn)) : null,
        }
      : { p_kanal_id: cid, p_icerik: body }

  const maxAttempts = hasAtt || isLocation ? 2 : 4
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

/**
 * @param data ArrayBuffer | { uri, fileName?, name?, mimeType?, type?, fileSize?, size? } (Expo picker)
 */
export async function uploadChatBlob(channelId, data, { contentType, fileName } = {}) {
  const cid = normalizeChatUuid(channelId)
  if (!cid) throw new Error('Geçersiz kanal')

  let uploadBody
  let rawMime = contentType || 'application/octet-stream'
  let nameHint = fileName || 'dosya'
  let sizeHint = null

  if (data instanceof ArrayBuffer) {
    uploadBody = data
    sizeHint = data.byteLength
  } else if (data && typeof data === 'object' && data.uri) {
    nameHint =
      fileName ||
      data.fileName ||
      data.name ||
      String(data.uri).split('/').pop() ||
      nameHint
    rawMime = contentType || data.mimeType || data.type || ''
    sizeHint =
      typeof data.fileSize === 'number'
        ? data.fileSize
        : typeof data.size === 'number'
          ? data.size
          : null
    uploadBody = await readLocalUriAsArrayBuffer(data.uri)
    if (sizeHint == null && uploadBody?.byteLength != null) sizeHint = uploadBody.byteLength
  } else {
    throw new Error('Desteklenmeyen dosya biçimi')
  }

  const kind = detectUploadKind(nameHint, rawMime)
  const mime = normalizeChatUploadContentType(rawMime, nameHint, kind)

  if (!isChatAttachmentAllowed({ mime: stripMimeParameters(mime), fileName: nameHint })) {
    throw new Error(chatUnsupportedFileMessage())
  }

  const supabase = getSupabase()
  const safe = sanitizeChatStorageFileName(nameHint)
  const path = `${cid}/${newChatObjectKey()}_${safe}`
  const { error } = await supabase.storage.from(CHAT_ATTACHMENTS_BUCKET).upload(path, uploadBody, {
    contentType: mime,
    upsert: false,
  })
  if (error) throw error

  return {
    ek_yol: path,
    ek_orijinal_ad: safe,
    ek_mime: mime,
    ek_boyut: sizeHint ?? uploadBody?.byteLength ?? null,
  }
}

export async function createChatAttachmentSignedUrl(storagePath, expiresSec = 3600) {
  const supabase = getSupabase()
  const { data, error } = await supabase.storage
    .from(CHAT_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresSec)
  if (error) throw error
  return data?.signedUrl ?? null
}

export function inferMesajTipiFromMime(mime) {
  const m = String(mime || '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'voice'
  return 'file'
}

export async function sendLocationMessage(kanalId, { lat, lng, label = '' }) {
  return sendMessage(kanalId, label, {
    mesaj_tipi: 'location',
    konum_lat: lat,
    konum_lng: lng,
    konum_etiket: label || null,
  })
}

/** Mesajı başka kanala iletir (ek dosyaları hedef kanala yeniden yükler). */
export async function forwardChatMessage(targetKanalId, sourceRow) {
  const tip = sourceRow?.mesaj_tipi || 'text'

  if (tip === 'text') {
    const parsed = parseChatMessageContent(sourceRow.icerik)
    let body = parsed.body
    if (parsed.reply) {
      body = formatReplyMessageBody({
        sender: parsed.reply.sender,
        preview: parsed.reply.preview,
        body,
      })
    }
    return sendMessage(targetKanalId, formatForwardedMessageBody(body))
  }

  if (tip === 'location') {
    const label = sourceRow.konum_etiket || sourceRow.icerik || ''
    return sendMessage(targetKanalId, formatForwardedMessageBody(), {
      mesaj_tipi: 'location',
      konum_lat: sourceRow.konum_lat,
      konum_lng: sourceRow.konum_lng,
      konum_etiket: label || null,
    })
  }

  if (tip === 'poll') {
    return sendMessage(targetKanalId, formatForwardedMessageBody(`📊 ${sourceRow.icerik || 'Anket'}`))
  }

  if (['image', 'video', 'file', 'voice'].includes(tip) && sourceRow.ek_yol) {
    const url = await createChatAttachmentSignedUrl(sourceRow.ek_yol, 3600)
    if (!url) throw new Error('Ek indirilemedi')
    const res = await fetch(url)
    if (!res.ok) throw new Error('Ek indirilemedi')
    const buf = await res.arrayBuffer()
    const uploaded = await uploadChatBlob(targetKanalId, buf, {
      contentType: sourceRow.ek_mime,
      fileName: sourceRow.ek_orijinal_ad || 'dosya',
    })
    const mesajTip =
      tip === 'voice' ? 'voice' : inferMesajTipiFromMime(uploaded.ek_mime || sourceRow.ek_mime)
    return sendMessage(targetKanalId, formatForwardedMessageBody(), {
      mesaj_tipi: mesajTip,
      ek_yol: uploaded.ek_yol,
      ek_orijinal_ad: uploaded.ek_orijinal_ad,
      ek_mime: uploaded.ek_mime,
      ek_boyut: uploaded.ek_boyut ?? sourceRow.ek_boyut ?? null,
      ses_suresi_sn: tip === 'voice' ? sourceRow.ses_suresi_sn : null,
    })
  }

  return sendMessage(targetKanalId, formatForwardedMessageBody(String(sourceRow.icerik || 'Mesaj')))
}

/** @param {unknown} error */
function formatSupabaseErrorForLog(error) {
  if (!error || typeof error !== 'object') {
    return { message: String(error ?? '') }
  }
  const e = /** @type {Record<string, unknown>} */ (error)
  return {
    message: e.message != null ? String(e.message) : null,
    code: e.code != null ? String(e.code) : null,
    details: e.details != null ? String(e.details) : null,
    hint: e.hint != null ? String(e.hint) : null,
    status: e.status != null ? Number(e.status) : null,
    name: e.name != null ? String(e.name) : null,
  }
}

/** @param {string} stage @param {Record<string, unknown>} [meta] */
function logChatAnket(stage, meta = {}) {
  console.error('[chatAnket]', stage, meta)
}

/** @param {string} msg @param {ReturnType<typeof formatSupabaseErrorForLog>} errInfo */
function classifyChatAnketRpcError(msg, errInfo) {
  const lower = msg.toLowerCase()
  if (lower.includes('row-level security') || lower.includes('row level security')) {
    if (lower.includes('sohbet_anketleri')) return 'rls_sohbet_anketleri'
    if (lower.includes('sohbet_anket_secenekleri')) return 'rls_sohbet_anket_secenekleri'
    if (lower.includes('sohbet_mesajlari')) return 'rls_sohbet_mesajlari'
    if (lower.includes('sohbet_uyeleri')) return 'rls_sohbet_uyeleri'
    if (lower.includes('sohbet_kanallari')) return 'rls_sohbet_kanallari'
    return 'rls_other'
  }
  if (
    lower.includes('chat_anket_gonder') &&
    (lower.includes('does not exist') || lower.includes('bulunamad'))
  ) {
    return 'rpc_missing'
  }
  if (errInfo.code === '42883' || errInfo.code === 'PGRST202') return 'rpc_missing'
  if (lower.includes('oturum gerekli')) return 'auth_session'
  if (lower.includes('yazma yetkiniz yok')) return 'channel_permission'
  return 'other'
}

export async function sendPollMessage(kanalId, { question, options, allowMultiple = false }) {
  const cid = normalizeChatUuid(kanalId)
  if (!cid) {
    logChatAnket('send:validation_failed', { reason: 'invalid_channel', kanalId: String(kanalId ?? '') })
    throw new Error('Geçersiz kanal')
  }
  const opts = (options || []).map((o) => String(o || '').trim()).filter(Boolean)
  if (opts.length < 2) {
    logChatAnket('send:validation_failed', { reason: 'min_options', kanalId: cid, optionCount: opts.length })
    throw new Error('En az 2 seçenek gerekli')
  }

  const soru = String(question || '').trim()
  const rpcArgs = {
    p_kanal_id: cid,
    p_soru: soru,
    p_secenekler: opts,
    p_coklu_secim: !!allowMultiple,
  }
  logChatAnket('send:rpc_start', {
    kanalId: cid,
    soruLength: soru.length,
    optionCount: opts.length,
    allowMultiple: !!allowMultiple,
    rpc: 'chat_anket_gonder',
  })

  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('chat_anket_gonder', rpcArgs)
  if (error) {
    const errInfo = formatSupabaseErrorForLog(error)
    const msg = String(errInfo.message || error.message || '')
    const errorKind = classifyChatAnketRpcError(msg, errInfo)
    logChatAnket('send:rpc_error', {
      kanalId: cid,
      rpc: 'chat_anket_gonder',
      errorKind,
      error: errInfo,
      rawMessage: msg,
    })
    if (
      (msg.includes('row-level security') || msg.includes('row level security')) &&
      (msg.includes('sohbet_anketleri') ||
        msg.includes('sohbet_uyeleri') ||
        msg.includes('sohbet_kanallari'))
    ) {
      const wrapped = new Error('Anket sunucu yapılandırması eksik. Lütfen yöneticinize bildirin.')
      wrapped.cause = error
      wrapped.chatAnketErrorKind = errorKind
      throw wrapped
    }
    throw error
  }

  logChatAnket('send:rpc_ok', { kanalId: cid, mesajId: data })
  return data
}

export async function voteChatPoll(mesajId, secenekId) {
  logChatAnket('vote:rpc_start', {
    mesajId,
    secenekId,
    rpc: 'chat_anket_oyla',
  })
  const supabase = getSupabase()
  const { error } = await supabase.rpc('chat_anket_oyla', {
    p_mesaj_id: mesajId,
    p_secenek_id: secenekId,
  })
  if (error) {
    const errInfo = formatSupabaseErrorForLog(error)
    const msg = String(errInfo.message || '')
    logChatAnket('vote:rpc_error', {
      mesajId,
      secenekId,
      rpc: 'chat_anket_oyla',
      errorKind: classifyChatAnketRpcError(msg, errInfo),
      error: errInfo,
      rawMessage: msg,
    })
    throw error
  }
  logChatAnket('vote:rpc_ok', { mesajId, secenekId })
}

/** @returns {Record<string, object>} */
export async function fetchPollDetailsByMessageIds(messageIds, currentUserId) {
  const ids = [...new Set((messageIds || []).map((id) => Number(id)).filter((n) => Number.isFinite(n)))]
  if (!ids.length) return {}

  const supabase = getSupabase()
  const { data: polls, error: pollErr } = await supabase
    .from('sohbet_anketleri')
    .select('mesaj_id, soru, coklu_secim')
    .in('mesaj_id', ids)
  if (pollErr) {
    if (isMissingColumnError(pollErr) || String(pollErr.message || '').includes('sohbet_anketleri')) return {}
    throw pollErr
  }
  if (!polls?.length) return {}

  const pollIds = polls.map((p) => p.mesaj_id)
  const { data: options, error: optErr } = await supabase
    .from('sohbet_anket_secenekleri')
    .select('id, mesaj_id, sira, metin')
    .in('mesaj_id', pollIds)
    .order('sira', { ascending: true })
  if (optErr) throw optErr

  const optionIds = (options || []).map((o) => o.id)
  let votes = []
  if (optionIds.length) {
    const { data: voteRows, error: voteErr } = await supabase
      .from('sohbet_anket_oylari')
      .select('secenek_id, kullanici_id')
      .in('secenek_id', optionIds)
    if (voteErr) throw voteErr
    votes = voteRows || []
  }

  const uid = normalizeChatUuid(currentUserId)
  const out = {}
  for (const poll of polls) {
    const pollOptions = (options || []).filter((o) => String(o.mesaj_id) === String(poll.mesaj_id))
    const voteCounts = {}
    const myVotes = []
    for (const opt of pollOptions) {
      const optVotes = votes.filter((v) => String(v.secenek_id) === String(opt.id))
      voteCounts[opt.id] = optVotes.length
      if (uid && optVotes.some((v) => normalizeChatUuid(v.kullanici_id) === uid)) {
        myVotes.push(opt.id)
      }
    }
    out[String(poll.mesaj_id)] = {
      soru: poll.soru,
      coklu_secim: !!poll.coklu_secim,
      secenekler: pollOptions.map((o) => ({
        id: o.id,
        sira: o.sira,
        metin: o.metin,
        oy_sayisi: voteCounts[o.id] || 0,
      })),
      benim_oylarim: myVotes,
    }
  }
  return out
}

/** RN’de fetch(uri) sık düşer; TaskDetail kanıt yükleme ile aynı strateji. */
async function readLocalUriAsArrayBuffer(uri) {
  const u = String(uri || '').trim()
  if (!u) throw new Error('Dosya yolu yok')
  try {
    const res = await fetch(u)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.arrayBuffer()
  } catch {
    const b64 = await FileSystem.readAsStringAsync(u, {
      encoding: FileSystem.EncodingType.Base64,
    })
    const raw = String(b64).replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '')
    return decodeBase64ArrayBuffer(raw)
  }
}

function detectUploadKind(fileName, mime) {
  const m = String(mime || '').trim().toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  const f = String(fileName || '').toLowerCase()
  if (/\.(jpe?g|jpeg|png|gif|webp|heic|heif)$/i.test(f)) return 'image'
  if (/\.(mp4|mov|webm|m4v)$/i.test(f)) return 'video'
  if (/\.(m4a|aac|mp3|ogg|wav|caf|3gp)$/i.test(f)) return 'audio'
  return 'file'
}

/** Bucket allowed_mime_types; Expo sık “octet-stream” döner. */
function normalizeChatUploadContentType(mime, fileName, kind) {
  let m = String(mime || '').trim().toLowerCase()
  const semi = m.indexOf(';')
  if (semi >= 0) m = m.slice(0, semi).trim()
  const fn = String(fileName || '').toLowerCase()

  if (fn.endsWith('.pdf')) return 'application/pdf'
  if (fn.endsWith('.doc')) return 'application/msword'
  if (fn.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (fn.endsWith('.txt')) return 'text/plain'
  if (fn.endsWith('.rtf')) return 'application/rtf'
  if (fn.endsWith('.csv')) return 'text/csv'
  if (fn.endsWith('.xls')) return 'application/vnd.ms-excel'
  if (fn.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (fn.endsWith('.ppt')) return 'application/vnd.ms-powerpoint'
  if (fn.endsWith('.pptx')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  }
  if (fn.endsWith('.odt')) return 'application/vnd.oasis.opendocument.text'
  if (fn.endsWith('.ods')) return 'application/vnd.oasis.opendocument.spreadsheet'
  if (fn.endsWith('.zip')) return 'application/zip'

  if (m && m !== 'application/octet-stream' && m !== 'binary/octet-stream') return m

  if (kind === 'image') {
    if (fn.endsWith('.png')) return 'image/png'
    if (fn.endsWith('.webp')) return 'image/webp'
    if (fn.endsWith('.gif')) return 'image/gif'
    if (fn.endsWith('.heic')) return 'image/heic'
    if (fn.endsWith('.heif')) return 'image/heif'
    return 'image/jpeg'
  }
  if (kind === 'video') {
    if (fn.endsWith('.mov')) return 'video/quicktime'
    if (fn.endsWith('.webm')) return 'video/webm'
    return 'video/mp4'
  }
  if (kind === 'audio') {
    if (fn.endsWith('.mp3')) return 'audio/mpeg'
    if (fn.endsWith('.ogg')) return 'audio/ogg'
    if (fn.endsWith('.wav')) return 'audio/wav'
    if (fn.endsWith('.caf')) return 'audio/x-caf'
    if (fn.endsWith('.3gp')) return 'audio/3gpp'
    return 'audio/mp4'
  }
  return m || 'application/octet-stream'
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
    return { state: 'sent', read: false, title: 'Gönderildi' }
  }

  let readCount = 0
  for (const r of peers) {
    if (messageIdAtLeast(r.son_okunan_mesaj_id, msgId)) readCount += 1
  }

  if (readCount === 0) {
    return { state: 'sent', read: false, title: 'Gönderildi' }
  }
  if (readCount === peers.length) {
    return {
      state: 'read',
      read: true,
      title: peers.length === 1 ? 'Görüldü' : 'Herkes gördü',
    }
  }
  return {
    state: 'delivered',
    read: false,
    title: peers.length === 1 ? 'İletildi' : `${readCount}/${peers.length} gördü`,
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

/** Kanal özet satırı (son_mesaj_at) güncellenince listeyi yenilemek için; kanal başına bir abonelik (üst sınır). */
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
      if (__DEV__ && status !== 'SUBSCRIBED') {
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
