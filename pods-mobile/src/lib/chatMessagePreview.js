/** Mesaj önizleme metni (ilet / yanıt). */
import { parseChatMessageContent } from './chatMessageContentParse'

export function buildMessagePreview(row) {
  const parsed = parseChatMessageContent(row?.icerik)
  const tip = row?.mesaj_tipi || 'text'

  if (parsed.reply?.preview && !parsed.body) return parsed.reply.preview
  if (parsed.forwarded && !parsed.body && !parsed.reply) {
    if (tip === 'image') return '📷 Fotoğraf'
    if (tip === 'video') return '🎬 Video'
    if (tip === 'voice') return '🎤 Sesli mesaj'
    if (tip === 'location') return `📍 ${row?.konum_etiket || 'Konum'}`
    if (tip === 'poll') return `📊 ${row?.icerik || 'Anket'}`
    if (tip === 'file') return `📎 ${row?.ek_orijinal_ad || 'Belge'}`
    return 'İletildi'
  }

  if (tip === 'image') return '📷 Fotoğraf'
  if (tip === 'video') return '🎬 Video'
  if (tip === 'voice') return '🎤 Sesli mesaj'
  if (tip === 'location') return `📍 ${row?.konum_etiket || row?.icerik || 'Konum'}`
  if (tip === 'poll') return `📊 ${row?.icerik || 'Anket'}`
  if (tip === 'file') return `📎 ${row?.ek_orijinal_ad || 'Belge'}`
  const t = String(parsed.body || '').trim()
  return t.length > 120 ? `${t.slice(0, 120)}…` : t || 'Mesaj'
}

export const CHAT_QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']
