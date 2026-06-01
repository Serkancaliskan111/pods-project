import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { MessagesSquare, X } from 'lucide-react'
import { AuthContext } from '../contexts/AuthContext.jsx'
import {
  channelLooksUnread,
  fetchMyChannels,
  resolveChannelTitles,
  subscribeChannelSummaries,
  CHAT_REALTIME_LIST_DEBOUNCE_MS,
} from '../lib/chatApi'
import QuickChatPanel from './cubicle/QuickChatPanel.jsx'

export default function FloatingChatWidget() {
  const { user, personel } = useContext(AuthContext)
  const uid = user?.id
  const companyId = personel?.ana_sirket_id

  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const listDebounceRef = useRef(null)

  const recalcUnread = useCallback((rows) => {
    setUnreadCount((rows || []).filter((c) => channelLooksUnread(c)).length)
  }, [])

  const loadChannels = useCallback(async () => {
    if (!uid || !companyId) {
      setUnreadCount(0)
      return []
    }
    try {
      const raw = await fetchMyChannels(uid)
      const titled = await resolveChannelTitles(raw, uid, companyId)
      recalcUnread(titled)
      return titled
    } catch {
      setUnreadCount(0)
      return []
    }
  }, [uid, companyId, recalcUnread])

  useEffect(() => {
    if (!uid || !companyId) return undefined
    let cancelled = false
    let channelIds = []

    const run = async () => {
      const rows = await loadChannels()
      if (!cancelled) channelIds = (rows || []).map((c) => c.id)
    }
    void run()

    const unsub = subscribeChannelSummaries(channelIds, () => {
      if (listDebounceRef.current) window.clearTimeout(listDebounceRef.current)
      listDebounceRef.current = window.setTimeout(() => void loadChannels(), CHAT_REALTIME_LIST_DEBOUNCE_MS)
    })

    const poll = window.setInterval(() => void loadChannels(), 20000)

    return () => {
      cancelled = true
      unsub?.()
      if (listDebounceRef.current) window.clearTimeout(listDebounceRef.current)
      window.clearInterval(poll)
    }
  }, [uid, companyId, loadChannels])

  useEffect(() => {
    if (open) void loadChannels()
  }, [open, loadChannels])

  if (!uid || !companyId) return null

  return (
    <>
      {open ? <QuickChatPanel onClose={() => setOpen(false)} /> : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`quick-chat-fab${open ? ' quick-chat-fab--open' : ''}`}
        title={open ? 'Sohbeti kapat' : 'Hızlı sohbet'}
        aria-label={open ? 'Sohbeti kapat' : 'Hızlı sohbet'}
        aria-expanded={open}
      >
        {open ? <X size={22} strokeWidth={2} /> : <MessagesSquare size={22} strokeWidth={1.85} />}
        {!open && unreadCount > 0 ? (
          <span className="quick-chat-fab__badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>
    </>
  )
}
