import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useChatShell } from './ChatShellContext.jsx'
import { MessageSquarePlus, Search } from 'lucide-react'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import {
  fetchMyChannels,
  resolveChannelTitles,
  subscribeChannelSummaries,
  channelLooksUnread,
  normalizeChatUuid,
  CHAT_REALTIME_LIST_DEBOUNCE_MS,
} from '../../../lib/chatApi'
import { chatInitials, chatWa, formatChatListTime } from './chatTheme.js'

export default function ChatSidebar() {
  const { activeChannelId, openChannel, openNew } = useChatShell()
  const { user, personel } = useContext(AuthContext)
  const uid = user?.id
  const companyId = personel?.ana_sirket_id
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debounceRef = useRef(null)

  const channelIdsKey = useMemo(
    () =>
      rows
        .map((r) => String(r.id))
        .sort()
        .join('|'),
    [rows],
  )

  const load = useCallback(async () => {
    if (!uid) return
    try {
      const raw = await fetchMyChannels(uid)
      const titled = await resolveChannelTitles(raw, uid, companyId)
      setRows(titled)
    } catch (e) {
      console.warn('[ChatSidebar]', e?.message || e)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [uid, companyId])

  useEffect(() => {
    if (!companyId) {
      setLoading(false)
      return undefined
    }
    void load()
    return undefined
  }, [load, companyId])

  useEffect(() => {
    if (!uid || !companyId || !channelIdsKey) return undefined
    const ids = rows.map((r) => r.id)
    const unsub = subscribeChannelSummaries(ids, () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => void load(), CHAT_REALTIME_LIST_DEBOUNCE_MS)
    })
    return () => {
      unsub()
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [uid, companyId, channelIdsKey, rows, load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((item) => {
      const title = String(item.displayTitle || '').toLowerCase()
      const preview = String(item.son_mesaj_ozet || '').toLowerCase()
      return title.includes(q) || preview.includes(q)
    })
  }, [rows, search])

  if (!companyId && !loading) {
    return (
      <aside className="chat-wa-sidebar">
        <div style={{ padding: 20, color: chatWa.textMuted, fontSize: 14 }}>
          Sohbet için şirket personeli kaydınız olmalıdır.
        </div>
      </aside>
    )
  }

  return (
    <aside className="chat-wa-sidebar">
      <header className="chat-wa-sidebar__header">
        <h1 className="chat-wa-sidebar__title">Sohbetler</h1>
        <button type="button" title="Yeni sohbet" className="chat-wa-sidebar__new-btn" onClick={openNew}>
          <MessageSquarePlus size={22} strokeWidth={1.75} />
        </button>
      </header>

      <div className="chat-wa-sidebar__search">
        <div className="chat-wa-sidebar__search-wrap">
          <Search size={16} className="chat-wa-sidebar__search-icon" />
          <input
            type="search"
            className="chat-wa-sidebar__search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara"
          />
        </div>
      </div>

      <div className="chat-wa-sidebar__list">
        {loading ? (
          <p style={{ padding: 20, color: chatWa.textMuted, fontSize: 14 }}>Yükleniyor…</p>
        ) : filtered.length === 0 ? (
          <p style={{ padding: 20, color: chatWa.textMuted, fontSize: 14, lineHeight: 1.5 }}>
            {rows.length === 0
              ? 'Henüz sohbet yok. Sağ üstten yeni sohbet başlatın.'
              : 'Aramanızla eşleşen sohbet bulunamadı.'}
          </p>
        ) : (
          filtered.map((item) => {
            const unread = channelLooksUnread(item)
            const time = formatChatListTime(item.son_mesaj_at)
            const title = item.displayTitle || 'Sohbet'
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openChannel(item.id)}
                className={`chat-wa-row${activeChannelId === normalizeChatUuid(item.id) ? ' is-active' : ''}`}
              >
                <span className="chat-wa-avatar" aria-hidden>
                  {chatInitials(title)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: 8,
                    }}
                  >
                    <span className={`chat-wa-row__title${unread ? ' is-unread' : ''}`}>{title}</span>
                    <span className={`chat-wa-row__time${unread ? ' is-unread' : ''}`}>{time}</span>
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 4,
                    }}
                  >
                    <span className="chat-wa-row__preview">{item.son_mesaj_ozet || '—'}</span>
                    {unread ? <span className="chat-wa-row__dot" aria-label="Okunmamış" /> : null}
                  </span>
                </span>
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
}
