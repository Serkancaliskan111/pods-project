import { cubicle } from '../../../theme/cubicle.js'

/** Sohbet arayüzü — sistem mavi / beyaz tonları (Cubicle ile uyumlu) */
export const chatWa = {
  shell: 'var(--cubicle-page-bg, #EEF1F5)',
  panel: '#ffffff',
  header: '#ffffff',
  border: cubicle.border,
  rowHover: '#f1f5f9',
  rowActive: '#e8f0fe',
  text: '#0f172a',
  textMuted: '#64748b',
  searchBg: '#f1f5f9',
  searchPlaceholder: '#94a3b8',
  wallpaper: '#f8fafc',
  bubbleOut: cubicle.sidebarBg,
  bubbleOutText: '#ffffff',
  bubbleIn: '#ffffff',
  bubbleInText: '#0f172a',
  inputBar: '#ffffff',
  inputField: '#f1f5f9',
  accent: cubicle.sidebarBg,
  accentHover: '#1d4ed8',
  unread: '#2563eb',
  tickRead: '#38bdf8',
  icon: '#64748b',
  avatarBg: '#dbeafe',
  avatarText: '#1d4ed8',
  emptyAccent: cubicle.sidebarBg,
  sidebarWidth: 420,
}

export function formatChatListTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((startOfToday - startOfMsg) / 86400000)
  if (diffDays === 0) {
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  }
  if (diffDays === 1) return 'Dün'
  if (diffDays < 7) {
    return d.toLocaleDateString('tr-TR', { weekday: 'short' })
  }
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function chatInitials(title) {
  const t = String(title || '?').trim()
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return t.slice(0, 2).toUpperCase()
}
