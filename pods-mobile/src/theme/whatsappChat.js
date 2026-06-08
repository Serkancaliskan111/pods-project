/** WhatsApp iOS/Android görsel dili — sohbet ekranları. */
export const WA = {
  header: '#075E54',
  headerAlt: '#128C7E',
  accent: '#25D366',
  accentDark: '#128C7E',
  unread: '#25D366',
  chatBg: '#ECE5DD',
  chatBgAlt: '#EFEAE2',
  listBg: '#FFFFFF',
  listDivider: '#E9EDEF',
  sentBubble: '#DCF8C6',
  receivedBubble: '#FFFFFF',
  composerBg: '#F0F0F0',
  inputBg: '#FFFFFF',
  textPrimary: '#111B21',
  textSecondary: '#667781',
  textHeader: '#FFFFFF',
  textTime: '#667781',
  tickRead: '#53BDEB',
  tickDefault: '#8696A0',
  searchBg: '#F0F2F5',
  fab: '#25D366',
}

/** Sohbet odası — WhatsApp karanlık mod (iOS). */
export const WAD = {
  header: '#1F2C34',
  chatBg: '#0B141A',
  sentBubble: '#005C4B',
  receivedBubble: '#202C33',
  composerBg: '#1F2C34',
  inputBg: '#2A3942',
  textPrimary: '#E9EDEF',
  textSecondary: '#8696A0',
  textHeader: '#E9EDEF',
  textTime: 'rgba(233,237,239,0.55)',
  icon: '#AEBAC1',
  link: '#53BDEB',
  tickRead: '#53BDEB',
  tickDefault: '#8696A0',
  groupAvatar: '#FF7A45',
  quoteAccent: '#25D366',
  scrollFab: '#2A3942',
}

export function formatWhatsAppListTime(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dayDiff = Math.round((startOfToday - startOfMsg) / 86400000)
  if (dayDiff === 0) {
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  }
  if (dayDiff === 1) return 'Dün'
  if (dayDiff < 7) {
    return d.toLocaleDateString('tr-TR', { weekday: 'short' })
  }
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const SENDER_COLORS = ['#E542A3', '#007AFF', '#FF9500', '#5856D6', '#34C759', '#AF52DE', '#FF2D55']

export function senderColorForId(id) {
  const s = String(id || '')
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return SENDER_COLORS[h % SENDER_COLORS.length]
}
