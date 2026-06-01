import { normalizeChatUuid } from '../../../lib/chatApi'

/** Tek sayfa: /admin/chat — kanal ?c=, yeni sohbet ?view=new */
export function parseChatSearchParams(searchParams) {
  const sp = searchParams instanceof URLSearchParams ? searchParams : new URLSearchParams(searchParams)
  if (sp.get('view') === 'new') {
    return { view: 'new', channelId: null }
  }
  const c = sp.get('c')
  if (c) {
    const channelId = normalizeChatUuid(c)
    if (channelId) return { view: 'room', channelId }
  }
  return { view: 'empty', channelId: null }
}

export function chatUrlForChannel(channelId) {
  const id = normalizeChatUuid(channelId)
  if (!id) return '/admin/chat'
  return `/admin/chat?c=${encodeURIComponent(id)}`
}

export function chatUrlForNew() {
  return '/admin/chat?view=new'
}

/** Eski /admin/chat/:id ve /admin/chat/new yolları (yönlendirme) */
export function parseChatRoute(pathname) {
  const path = String(pathname || '').replace(/\/$/, '')
  if (path === '/admin/chat') {
    return { view: 'empty', channelId: null }
  }
  if (path === '/admin/chat/new') {
    return { view: 'new', channelId: null }
  }
  const m = path.match(/^\/admin\/chat\/([^/]+)$/)
  if (m?.[1]) {
    return { view: 'room', channelId: normalizeChatUuid(m[1]) }
  }
  return { view: 'empty', channelId: null }
}
