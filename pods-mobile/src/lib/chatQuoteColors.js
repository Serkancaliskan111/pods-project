import { palette } from '../theme/palette'

const QUOTE_COLORS = ['#E542A3', '#007AFF', '#FF9500', '#5856D6', '#34C759', '#AF52DE', '#FF2D55']

export function quoteColorForSender(senderName, myName, theme) {
  const s = String(senderName || '').trim()
  if (!s) return theme?.accent || palette.primary[600]
  const me = String(myName || '').trim()
  if (me && (s === me || s === 'Siz')) return theme?.brand || theme?.accent || palette.primary[700]
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h + s.charCodeAt(i) * 31) % QUOTE_COLORS.length
  return QUOTE_COLORS[h]
}
