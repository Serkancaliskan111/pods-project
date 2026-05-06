import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import {
  fetchCompanyPeersForChat,
  rpcStartDm,
  rpcCreateGroup,
} from '../../../lib/chatApi'

export default function ChatNewPage() {
  const navigate = useNavigate()
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
        navigate(`/admin/chat/${chan}`)
      } catch (e) {
        console.warn('[ChatNew dm]', e?.message || e)
      } finally {
        setOpening(null)
      }
    },
    [navigate, opening],
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
      navigate(`/admin/chat/${chan}`)
    } catch (e) {
      console.warn('[ChatNew group]', e?.message || e)
    } finally {
      setCreating(false)
    }
  }, [canCreateGroup, groupTitle, selectedIds, navigate])

  if (!companyId && !loading) {
    return (
      <div style={{ padding: 24 }}>
        <Link to="/admin/chat" style={{ fontWeight: 700, color: '#0a1e42', textDecoration: 'none' }}>
          ← Sohbetler
        </Link>
        <p style={{ marginTop: 16, color: '#64748b' }}>Personel kaydı bulunamadı.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, backgroundColor: '#f8fafc', minHeight: '100%' }}>
      <Link to="/admin/chat" style={{ fontWeight: 700, color: '#0a1e42', textDecoration: 'none', fontSize: 14 }}>
        ← Sohbetler
      </Link>
      <h1 style={{ marginTop: 16, fontSize: 26, fontWeight: 800, color: '#0f172a' }}>Yeni sohbet</h1>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => setMode('dm')}
          style={{
            padding: '8px 14px',
            borderRadius: 10,
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: mode === 'dm' ? '#0a1e42' : '#e2e8f0',
            color: mode === 'dm' ? '#fff' : '#334155',
          }}
        >
          Birebir
        </button>
        <button
          type="button"
          onClick={() => setMode('group')}
          style={{
            padding: '8px 14px',
            borderRadius: 10,
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: mode === 'group' ? '#0a1e42' : '#e2e8f0',
            color: mode === 'group' ? '#fff' : '#334155',
          }}
        >
          Grup
        </button>
      </div>

      {mode === 'dm' ? (
        <>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="İsim veya e-posta ara…"
            style={{
              marginTop: 16,
              width: '100%',
              maxWidth: 420,
              padding: '11px 12px',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              fontSize: 15,
            }}
          />
          {loading ? (
            <p style={{ marginTop: 24, color: '#64748b' }}>Yükleniyor…</p>
          ) : (
            <ul style={{ marginTop: 18, listStyle: 'none', padding: 0, maxWidth: 520 }}>
              {filtered.map((p) => {
                const name = `${p.ad || ''} ${p.soyad || ''}`.trim() || p.email || 'Personel'
                const busy = opening === p.kullanici_id
                return (
                  <li key={p.kullanici_id} style={{ marginBottom: 8 }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void openDm(p.kullanici_id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '12px 14px',
                        borderRadius: 12,
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#fff',
                        fontWeight: 700,
                        cursor: busy ? 'wait' : 'pointer',
                        fontSize: 15,
                      }}
                    >
                      {name}
                    </button>
                  </li>
                )
              })}
              {!filtered.length ? <li style={{ color: '#64748b' }}>Eşleşen personel yok.</li> : null}
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
            style={{
              marginTop: 16,
              width: '100%',
              maxWidth: 420,
              padding: '11px 12px',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              fontSize: 16,
              fontWeight: 700,
            }}
          />
          <p style={{ marginTop: 10, fontSize: 13, color: '#64748b', fontWeight: 600 }}>
            En az bir kişi seçin (siz otomatik eklenirsiniz).
          </p>
          {loading ? (
            <p style={{ marginTop: 24, color: '#64748b' }}>Yükleniyor…</p>
          ) : (
            <ul style={{ marginTop: 14, listStyle: 'none', padding: 0, maxWidth: 520 }}>
              {peers.map((p) => {
                const name = `${p.ad || ''} ${p.soyad || ''}`.trim() || p.email || 'Personel'
                const on = selected.has(p.kullanici_id)
                return (
                  <li key={p.kullanici_id} style={{ marginBottom: 8 }}>
                    <button
                      type="button"
                      onClick={() => toggle(p.kullanici_id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '12px 14px',
                        borderRadius: 12,
                        border: on ? '2px solid #0a1e42' : '1px solid #e2e8f0',
                        backgroundColor: on ? '#eff6ff' : '#fff',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: 15,
                      }}
                    >
                      {name}
                    </button>
                  </li>
                )
              })}
              {!peers.length ? <li style={{ color: '#64748b' }}>Şirkette başka personel yok.</li> : null}
            </ul>
          )}
          <button
            type="button"
            onClick={() => void onCreateGroup()}
            disabled={!canCreateGroup}
            style={{
              marginTop: 20,
              backgroundColor: canCreateGroup ? '#e95422' : '#cbd5e1',
              color: '#fff',
              fontWeight: 800,
              border: 'none',
              borderRadius: 12,
              padding: '12px 22px',
              cursor: canCreateGroup ? 'pointer' : 'not-allowed',
            }}
          >
            {creating ? 'Oluşturuluyor…' : 'Grubu oluştur'}
          </button>
        </>
      )}
    </div>
  )
}
