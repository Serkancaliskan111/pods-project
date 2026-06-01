/** Kanal bazlı bellek önbelleği — sohbetler arası geçişte anında gösterim */
const channelCache = new Map()
const draftByChannel = new Map()

export function getCachedChannel(channelId) {
  if (!channelId) return null
  return channelCache.get(String(channelId)) || null
}

export function setCachedChannel(channelId, snapshot) {
  if (!channelId || !snapshot) return
  channelCache.set(String(channelId), snapshot)
}

export function getChannelDraft(channelId) {
  if (!channelId) return ''
  return draftByChannel.get(String(channelId)) || ''
}

export function setChannelDraft(channelId, draft) {
  if (!channelId) return
  const text = String(draft ?? '')
  if (text) draftByChannel.set(String(channelId), text)
  else draftByChannel.delete(String(channelId))
}
