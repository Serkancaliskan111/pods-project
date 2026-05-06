import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import {
  fetchMyChannels,
  resolveChannelTitles,
  subscribeChannelSummaries,
  channelLooksUnread,
  CHAT_REALTIME_LIST_DEBOUNCE_MS,
} from '../../../lib/chatApi'

export default function ChatListPage() {
  const { user, personel } = useContext(AuthContext)
  const uid = user?.id
  const companyId = personel?.ana_sirket_id
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
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
      console.warn('[ChatList]', e?.message || e)
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

  if (!companyId && !loading) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>Sohbet</h1>
        <p style={{ marginTop: 8, color: '#64748b', fontSize: 14 }}>
          Sohbet için şirket personeli kaydınız olmalıdır.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, backgroundColor: '#f8fafc', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a' }}>Sohbet</h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Şirket içi birebir ve grup konuşmaları</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link
            to="/admin/chat/new?mode=dm"
            style={{
              backgroundColor: '#e95422',
              color: '#fff',
              fontWeight: 700,
              padding: '10px 18px',
              borderRadius: 12,
              textDecoration: 'none',
              fontSize: 14,
            }}
          >
            Birebir sohbet
          </Link>
          <Link
            to="/admin/chat/new?mode=group"
            style={{
              backgroundColor: '#0f766e',
              color: '#fff',
              fontWeight: 700,
              padding: '10px 18px',
              borderRadius: 12,
              textDecoration: 'none',
              fontSize: 14,
            }}
          >
            Yeni grup
          </Link>
        </div>
      </div>

      {loading ? (
        <p style={{ marginTop: 32, color: '#64748b' }}>Yükleniyor…</p>
      ) : rows.length === 0 ? (
        <p style={{ marginTop: 32, color: '#64748b' }}>Henüz sohbet yok. Yeni sohbet ile başlayın.</p>
      ) : (
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((item) => {
            const unread = channelLooksUnread(item)
            const time =
              item.son_mesaj_at &&
              new Date(item.son_mesaj_at).toLocaleString('tr-TR', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })
            return (
              <Link
                key={item.id}
                to={`/admin/chat/${item.id}`}
                style={{
                  textDecoration: 'none',
                  backgroundColor: '#fff',
                  borderRadius: 14,
                  padding: '14px 16px',
                  border: '1px solid #e2e8f0',
                  display: 'block',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 16 }}>{item.displayTitle}</span>
                  <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{time}</span>
                </div>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.son_mesaj_ozet || '—'}
                  </span>
                  {unread ? (
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 5,
                        backgroundColor: '#e95422',
                        flexShrink: 0,
                      }}
                    />
                  ) : null}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
