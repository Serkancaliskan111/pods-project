import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import {
  fetchCompanyPeersForChat,
  rpcStartDm,
  rpcCreateGroup,
} from '../../../lib/chatApi'
import { chatWa } from './chatTheme.js'
import { useChatShell } from './ChatShellContext.jsx'

export default function ChatNewPage({ embedded: embeddedProp }) {
  const { embedded: embeddedFromOutlet } = useOutletContext() || {}
  const embedded = embeddedProp ?? embeddedFromOutlet ?? false
  const { openChannel, openEmpty } = useChatShell()
  const [searchParams] = useSearchParams()
  const { user, personel } = useContext(AuthContext)
  const uid = user?.id
  const companyId = personel?.ana_sirket_id

  const [mode, setMode] = useState('dm')
  const [q, setQ] = useState('')
  const [peers, setPeers] = useState([])
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(null)
  const [groupTitle, setGroupTitle] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [creating, setCreating] = useState(false)

  const loadPeers = useCallback(async () => {
    if (!companyId || !uid) {
      setPeers([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const rows = await fetchCompanyPeersForChat(companyId, uid)
      setPeers(rows)
    } catch (e) {
      console.warn('[ChatNew]', e?.message || e)
      setPeers([])
    } finally {
      setLoading(false)
    }
  }, [companyId, uid])

  useEffect(() => {
    void loadPeers()
  }, [loadPeers])

  useEffect(() => {
    const m = searchParams.get('mode')
    if (m === 'group') setMode('group')
    else if (m === 'dm') setMode('dm')
  }, [searchParams])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return peers
    return peers.filter((p) => {
      const name = `${p.ad || ''} ${p.soyad || ''}`.trim().toLowerCase()
      const mail = String(p.email || '').toLowerCase()
      return name.includes(s) || mail.includes(s)
    })
  }, [peers, q])

  const openDm = useCallback(
    async (kullaniciId) => {
      if (!kullaniciId || opening) return
      setOpening(kullaniciId)
      try {
        const chan = await rpcStartDm(kullaniciId)
        openChannel(chan)
      } catch (e) {
        console.warn('[ChatNew dm]', e?.message || e)
      } finally {
        setOpening(null)
      }
    },
    [openChannel, opening],
  )

  const toggle = useCallback((kid) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(kid)) next.delete(kid)
      else next.add(kid)
      return next
    })
  }, [])

  const selectedIds = useMemo(() => [...selected], [selected])

  const canCreateGroup =
    groupTitle.trim().length > 0 && selectedIds.length >= 1 && !creating

  const onCreateGroup = useCallback(async () => {
    if (!canCreateGroup) return
    setCreating(true)
    try {
      const chan = await rpcCreateGroup(groupTitle.trim(), selectedIds)
      openChannel(chan)
    } catch (e) {
      console.warn('[ChatNew group]', e?.message || e)
    } finally {
      setCreating(false)
    }
  }, [canCreateGroup, groupTitle, selectedIds, openChannel])

  const shellStyle = embedded
    ? {
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        background: chatWa.header,
      }
    : { padding: 24, backgroundColor: '#f8fafc', minHeight: '100%' }

  const inputStyle = embedded
    ? {
        width: '100%',
        boxSizing: 'border-box',
        padding: '10px 12px',
        borderRadius: 8,
        border: 'none',
        background: chatWa.searchBg,
        color: chatWa.text,
        fontSize: 15,
        outline: 'none',
      }
    : {
        marginTop: 16,
        width: '100%',
        maxWidth: 420,
        padding: '11px 12px',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        fontSize: 15,
      }

  if (!companyId && !loading) {
    return (
      <div style={shellStyle}>
        <p style={{ padding: 20, color: chatWa.textMuted }}>Personel kaydı bulunamadı.</p>
      </div>
    )
  }

  return (
    <div className={embedded ? 'chat-wa-room' : undefined} style={shellStyle}>
      <header
        className={embedded ? 'chat-wa-room__header' : undefined}
        style={{
          flexShrink: 0,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: `1px solid ${chatWa.border}`,
          background: chatWa.header,
        }}
      >
        <button
          type="button"
          onClick={openEmpty}
          className="chat-wa-icon-btn"
          aria-label="Geri"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: chatWa.text }}>Yeni sohbet</h1>
      </header>

      <div
        className={embedded ? 'chat-wa-sidebar__list' : undefined}
        style={{ flex: 1, overflowY: 'auto', padding: embedded ? '12px 16px' : 0, minHeight: 0 }}
      >
        {!embedded ? (
          <Link to="/admin/chat" style={{ fontWeight: 700, color: '#0a1e42', textDecoration: 'none', fontSize: 14 }}>
            ← Sohbetler
          </Link>
        ) : null}

        <div className="chat-wa-new__modes">
          {['dm', 'group'].map((m) => (
            <button
              key={m}
              type="button"
              className={`chat-wa-new__mode-btn${mode === m ? ' is-active' : ''}`}
              onClick={() => setMode(m)}
            >
              {m === 'dm' ? 'Birebir' : 'Grup'}
            </button>
          ))}
        </div>

        {mode === 'dm' ? (
          <>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="İsim veya e-posta ara…"
              style={{ ...inputStyle, marginTop: 12 }}
            />
            {loading ? (
              <p style={{ marginTop: 24, color: chatWa.textMuted }}>Yükleniyor…</p>
            ) : (
              <ul style={{ marginTop: 12, listStyle: 'none', padding: 0 }}>
                {filtered.map((p) => {
                  const name = `${p.ad || ''} ${p.soyad || ''}`.trim() || p.email || 'Personel'
                  const busy = opening === p.kullanici_id
                  return (
                    <li key={p.kullanici_id} style={{ marginBottom: 2 }}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void openDm(p.kullanici_id)}
                        className="chat-wa-row"
                        style={{
                          width: '100%',
                          border: 'none',
                          cursor: busy ? 'wait' : 'pointer',
                          textAlign: 'left',
                          background: 'transparent',
                        }}
                      >
                        <span className="chat-wa-avatar" style={{ width: 40, height: 40, fontSize: 13 }}>
                          {(name.slice(0, 2) || '?').toUpperCase()}
                        </span>
                        <span style={{ fontSize: 16, color: chatWa.text }}>{name}</span>
                      </button>
                    </li>
                  )
                })}
                {!filtered.length ? (
                  <li style={{ color: chatWa.textMuted, padding: 12 }}>Eşleşen personel yok.</li>
                ) : null}
              </ul>
            )}
          </>
        ) : (
          <>
            <input
              type="text"
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
              placeholder="Grup adı"
              maxLength={120}
              style={{ ...inputStyle, marginTop: 12, fontWeight: 600 }}
            />
            <p style={{ marginTop: 10, fontSize: 13, color: chatWa.textMuted }}>
              En az bir kişi seçin (siz otomatik eklenirsiniz).
            </p>
            {loading ? (
              <p style={{ marginTop: 24, color: chatWa.textMuted }}>Yükleniyor…</p>
            ) : (
              <ul style={{ marginTop: 12, listStyle: 'none', padding: 0 }}>
                {peers.map((p) => {
                  const name = `${p.ad || ''} ${p.soyad || ''}`.trim() || p.email || 'Personel'
                  const on = selected.has(p.kullanici_id)
                  return (
                    <li key={p.kullanici_id} style={{ marginBottom: 2 }}>
                      <button
                        type="button"
                        onClick={() => toggle(p.kullanici_id)}
                        className={`chat-wa-row${on ? ' is-active' : ''}`}
                        style={{
                          width: '100%',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                          background: on ? chatWa.rowActive : 'transparent',
                        }}
                      >
                        <span className="chat-wa-avatar" style={{ width: 40, height: 40, fontSize: 13 }}>
                          {(name.slice(0, 2) || '?').toUpperCase()}
                        </span>
                        <span style={{ fontSize: 16, color: chatWa.text }}>{name}</span>
                      </button>
                    </li>
                  )
                })}
                {!peers.length ? (
                  <li style={{ color: chatWa.textMuted, padding: 12 }}>Şirkette başka personel yok.</li>
                ) : null}
              </ul>
            )}
            <button
              type="button"
              onClick={() => void onCreateGroup()}
              disabled={!canCreateGroup}
              style={{
                marginTop: 16,
                width: '100%',
                backgroundColor: canCreateGroup ? chatWa.accent : chatWa.searchBg,
                color: canCreateGroup ? '#ffffff' : chatWa.textMuted,
                fontWeight: 700,
                border: 'none',
                borderRadius: 8,
                padding: '12px 22px',
                cursor: canCreateGroup ? 'pointer' : 'not-allowed',
              }}
            >
              {creating ? 'Oluşturuluyor…' : 'Grubu oluştur'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
