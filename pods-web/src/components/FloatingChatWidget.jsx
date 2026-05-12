import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, X, Send, ListTodo } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext.jsx'
import { canAssignTask } from '../lib/permissions.js'
import {
  channelLooksUnread,
  createChatAttachmentSignedUrl,
  fetchChannelMembers,
  fetchCompanyPeersForChat,
  fetchKanal,
  fetchChannelMemberReadStates,
  fetchMessages,
  fetchMyChannels,
  fetchUserAvatarIds,
  markRead,
  normalizeChatUuid,
  resolveChannelTitles,
  rpcStartDm,
  sendMessage,
  sortMessagesByIdAsc,
  maxPeerReadMessageId,
  subscribeMembershipReadStates,
  subscribeChannelSummaries,
  subscribeRoomInserts,
  CHAT_REALTIME_LIST_DEBOUNCE_MS,
  uploadChatBlob,
  inferMesajTipiFromMime,
} from '../lib/chatApi'
import { avatarEmojiById } from '../lib/avatarTemplates'

function fmtClock(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

function initials(text) {
  const raw = String(text || '').trim()
  if (!raw) return '?'
  const parts = raw.split(/\s+/).filter(Boolean)
  return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase() || '?'
}

function ChatAttachmentInline({ row, mine }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const yol = row?.ek_yol
    if (!yol) return undefined
    createChatAttachmentSignedUrl(yol, 3600)
      .then((u) => {
        if (alive) setUrl(u)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [row?.ek_yol])

  const tip = row?.mesaj_tipi || 'file'
  if (failed) return <div style={{ fontSize: 12, opacity: 0.85 }}>Ek açılamadı</div>
  if (!url) return <div style={{ fontSize: 12, opacity: 0.85 }}>Ek yükleniyor…</div>

  if (tip === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer" style={{ display: 'block', maxWidth: 240 }}>
        <img src={url} alt="" style={{ width: '100%', borderRadius: 10, display: 'block' }} />
      </a>
    )
  }
  if (tip === 'video') {
    return (
      <a href={url} target="_blank" rel="noreferrer" style={{ display: 'block', maxWidth: 240 }}>
        <video
          src={`${url}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          style={{ width: '100%', borderRadius: 10, display: 'block' }}
        >
          <track kind="captions" />
        </video>
      </a>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{
        color: mine ? '#fff' : '#0a1e42',
        textDecoration: 'underline',
        fontWeight: 700,
        fontSize: 12,
      }}
    >
      📎 {row?.ek_orijinal_ad || 'Dosyayı aç'}
    </a>
  )
}

export default function FloatingChatWidget() {
  const { user, personel, profile } = useContext(AuthContext)
  const navigate = useNavigate()
  const uid = user?.id
  const uidNorm = normalizeChatUuid(uid)
  const companyId = personel?.ana_sirket_id
  const permissions = profile?.yetkiler || {}
  const isSystemAdmin = !!profile?.is_system_admin
  const canQuickAssignTask = canAssignTask(permissions, isSystemAdmin)

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contacts, setContacts] = useState([])
  const [contactSearch, setContactSearch] = useState('')
  const [channels, setChannels] = useState([])
  const [activeChannelId, setActiveChannelId] = useState(null)
  const [activeTitle, setActiveTitle] = useState('Sohbet')
  const [activeChannelType, setActiveChannelType] = useState('birebir')
  const [messages, setMessages] = useState([])
  const [memberReads, setMemberReads] = useState([])
  const [groupMemberNames, setGroupMemberNames] = useState([])
  const [groupCreatorLabel, setGroupCreatorLabel] = useState('')
  const [senderNameByUserId, setSenderNameByUserId] = useState({})
  const [draft, setDraft] = useState('')
  const [pendingAttachment, setPendingAttachment] = useState(null)
  const [sending, setSending] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState(null)
  const [hoveredMessageId, setHoveredMessageId] = useState(null)
  const [openMenuMessageId, setOpenMenuMessageId] = useState(null)
  const [activeTab, setActiveTab] = useState('threads')
  const [threadsSearch, setThreadsSearch] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [avatarByUserId, setAvatarByUserId] = useState({})

  const listDebounceRef = useRef(null)
  const scrollerRef = useRef(null)
  const isDm = activeChannelType === 'birebir'
  const peerMaxReadId = useMemo(() => (uid ? maxPeerReadMessageId(memberReads, uid) : null), [memberReads, uid])

  const channelIdsKey = useMemo(
    () =>
      channels
        .map((c) => String(c.id))
        .sort()
        .join('|'),
    [channels],
  )

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter((c) => {
      const name = `${c?.ad || ''} ${c?.soyad || ''}`.trim().toLowerCase()
      const mail = String(c?.email || '').toLowerCase()
      return name.includes(q) || mail.includes(q)
    })
  }, [contacts, contactSearch])

  const filteredThreads = useMemo(() => {
    const q = threadsSearch.trim().toLowerCase()
    if (!q) return channels
    return channels.filter((c) => {
      const title = String(c?.displayTitle || '').toLowerCase()
      const summary = String(c?.son_mesaj_ozet || '').toLowerCase()
      return title.includes(q) || summary.includes(q)
    })
  }, [channels, threadsSearch])

  const recalcUnread = useCallback((rows) => {
    const cnt = (rows || []).filter((c) => channelLooksUnread(c)).length
    setUnreadCount(cnt)
  }, [])

  const loadChannels = useCallback(async () => {
    if (!uid || !companyId) return
    try {
      const raw = await fetchMyChannels(uid)
      const titled = await resolveChannelTitles(raw, uid, companyId)
      setChannels(titled)
      recalcUnread(titled)
      const dmPeers = titled
        .filter((c) => c?.tur === 'birebir')
        .map((c) => {
          const low = normalizeChatUuid(c.dm_user_low)
          const other = low === uidNorm ? c.dm_user_high : c.dm_user_low
          return normalizeChatUuid(other)
        })
        .filter(Boolean)
      if (dmPeers.length) {
        try {
          const map = await fetchUserAvatarIds(dmPeers)
          setAvatarByUserId((prev) => ({ ...prev, ...map }))
        } catch {
          // noop
        }
      }
    } catch (e) {
      console.warn('[FloatingChat channels]', e?.message || e)
    }
  }, [uid, uidNorm, companyId, recalcUnread])

  const loadContacts = useCallback(async () => {
    if (!companyId || !uidNorm) return
    setContactsLoading(true)
    try {
      const data = await fetchCompanyPeersForChat(companyId, uidNorm)
      setContacts(data || [])
      const ids = (data || []).map((x) => normalizeChatUuid(x?.kullanici_id)).filter(Boolean)
      if (ids.length) {
        try {
          const map = await fetchUserAvatarIds(ids)
          setAvatarByUserId((prev) => ({ ...prev, ...map }))
        } catch {
          // noop
        }
      }
    } catch (e) {
      console.warn('[FloatingChat contacts]', e?.message || e)
      setContacts([])
    } finally {
      setContactsLoading(false)
    }
  }, [companyId, uidNorm])

  const loadRoom = useCallback(
    async (channelId) => {
      if (!channelId || !uid) return
      setLoading(true)
      try {
        const kanal = await fetchKanal(channelId)
        setActiveChannelType(kanal?.tur || 'birebir')
        const titled = await resolveChannelTitles([kanal].filter(Boolean), uid, companyId)
        if (titled?.[0]) {
          setActiveTitle(titled[0].displayTitle || 'Sohbet')
          setGroupCreatorLabel(titled[0].tur === 'grup' ? titled[0].groupCreatorName || '' : '')
        }
        try {
          const members = await fetchChannelMembers(channelId, companyId)
          const nameMap = {}
          for (const m of members || []) {
            const k = normalizeChatUuid(m?.kullanici_id)
            if (!k) continue
            nameMap[k] = String(m?.ad_soyad || '').trim() || `Kullanıcı ${k.slice(0, 8)}`
          }
          setSenderNameByUserId(nameMap)
          if (kanal?.tur === 'grup') {
            setGroupMemberNames((members || []).map((m) => m.ad_soyad).filter(Boolean))
          } else {
            setGroupMemberNames([])
            setGroupCreatorLabel('')
          }
        } catch {
          setSenderNameByUserId({})
          setGroupMemberNames([])
          if (kanal?.tur !== 'grup') setGroupCreatorLabel('')
        }
        const rows = await fetchMessages(channelId)
        const sorted = sortMessagesByIdAsc(rows || [])
        setMessages(sorted)
        try {
          const reads = await fetchChannelMemberReadStates(channelId)
          setMemberReads(reads || [])
        } catch {
          setMemberReads([])
        }
        const last = sorted[sorted.length - 1]
        if (last?.id) {
          try {
            await markRead(channelId, last.id)
          } catch {
            // noop
          }
        }
        setActiveTab('threads')
      } catch (e) {
        console.warn('[FloatingChat room]', e?.message || e)
        setMessages([])
      } finally {
        setLoading(false)
      }
    },
    [uid, companyId],
  )

  const openDmWith = useCallback(
    async (kullaniciId, fallbackTitle) => {
      if (!kullaniciId) return
      setLoading(true)
      try {
        const cid = await rpcStartDm(kullaniciId)
        setActiveChannelId(cid)
        setActiveTitle(fallbackTitle || 'Sohbet')
        await loadRoom(cid)
        await loadChannels()
      } catch (e) {
        console.warn('[FloatingChat startDm]', e?.message || e)
      } finally {
        setLoading(false)
      }
    },
    [loadRoom, loadChannels],
  )

  const onSend = useCallback(async () => {
    const text = String(draft || '').trim()
    const file = pendingAttachment
    if ((!text && !file) || !activeChannelId || sending) return
    setSending(true)
    try {
      if (file) {
        const uploaded = await uploadChatBlob(activeChannelId, file, {
          contentType: file.type || undefined,
          fileName: file.name,
        })
        const tip = inferMesajTipiFromMime(file.type)
        await sendMessage(activeChannelId, text, {
          mesaj_tipi: tip,
          ek_yol: uploaded.ek_yol,
          ek_orijinal_ad: uploaded.ek_orijinal_ad,
          ek_mime: uploaded.ek_mime,
          ek_boyut: uploaded.ek_boyut ?? file.size ?? null,
        })
      } else {
        await sendMessage(activeChannelId, text)
      }
      setDraft('')
      setPendingAttachment(null)
      const rows = await fetchMessages(activeChannelId)
      const sorted = sortMessagesByIdAsc(rows || [])
      setMessages(sorted)
      const last = sorted[sorted.length - 1]
      if (last?.id) await markRead(activeChannelId, last.id)
      await loadChannels()
    } catch (e) {
      console.warn('[FloatingChat send]', e?.message || e)
    } finally {
      setSending(false)
    }
  }, [draft, pendingAttachment, activeChannelId, sending, loadChannels])

  useEffect(() => {
    void loadChannels()
  }, [loadChannels])

  useEffect(() => {
    if (!uid || !companyId || !channelIdsKey) return undefined
    const ids = channels.map((c) => c.id)
    const unsub = subscribeChannelSummaries(ids, () => {
      if (listDebounceRef.current) window.clearTimeout(listDebounceRef.current)
      listDebounceRef.current = window.setTimeout(
        () => void loadChannels(),
        CHAT_REALTIME_LIST_DEBOUNCE_MS,
      )
    })
    return () => {
      unsub()
      if (listDebounceRef.current) window.clearTimeout(listDebounceRef.current)
    }
  }, [uid, companyId, channels, channelIdsKey, loadChannels])

  useEffect(() => {
    const id = window.setInterval(() => void loadChannels(), 20000)
    return () => window.clearInterval(id)
  }, [loadChannels])

  useEffect(() => {
    if (!activeChannelId || !open) return undefined
    const unsub = subscribeRoomInserts(activeChannelId, async (row) => {
      setMessages((prev) => sortMessagesByIdAsc([...prev, row]))
      if (normalizeChatUuid(row?.gonderen_kullanici_id) !== uidNorm && row?.id) {
        try {
          await markRead(activeChannelId, row.id)
        } catch {
          // noop
        }
      }
      void loadChannels()
    })
    return () => unsub()
  }, [activeChannelId, open, uidNorm, loadChannels])

  useEffect(() => {
    if (!activeChannelId || !open) return undefined
    const unsub = subscribeMembershipReadStates(activeChannelId, (row) => {
      const who = normalizeChatUuid(row?.kullanici_id)
      if (!who) return
      setMemberReads((prev) => {
        const next = [...(prev || [])]
        const i = next.findIndex((x) => normalizeChatUuid(x?.kullanici_id) === who)
        if (i >= 0) next[i] = { ...next[i], ...row }
        else next.push(row)
        return next
      })
    })
    return () => unsub()
  }, [activeChannelId, open])

  useEffect(() => {
    if (!open || (contacts.length && activeTab !== 'people')) return
    void loadContacts()
  }, [open, contacts.length, activeTab, loadContacts])

  useEffect(() => {
    if (!open) return
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  if (!uid || !companyId) return null

  const readReceiptUi = (msgId, mine) => {
    if (!mine) return null
    if (!isDm) return { ticks: '✓', read: false }
    if (peerMaxReadId == null) return { ticks: '✓', read: false }
    let ge = false
    try {
      ge = BigInt(String(peerMaxReadId)) >= BigInt(String(msgId))
    } catch {
      ge = Number(peerMaxReadId) >= Number(msgId)
    }
    return ge ? { ticks: '✓✓', read: true } : { ticks: '✓✓', read: false }
  }

  const buildMessageAudit = (m) => {
    const sender = normalizeChatUuid(m?.gonderen_kullanici_id)
    const peers = Object.keys(senderNameByUserId || {}).filter((u) => u && u !== sender)
    const read = []
    const delivered = []
    for (const u of peers) {
      const row = (memberReads || []).find((r) => normalizeChatUuid(r?.kullanici_id) === u)
      let seen = false
      try {
        seen = row?.son_okunan_mesaj_id != null && BigInt(String(row.son_okunan_mesaj_id)) >= BigInt(String(m?.id))
      } catch {
        seen = Number(row?.son_okunan_mesaj_id) >= Number(m?.id)
      }
      if (seen) read.push(senderNameByUserId[u] || u)
      else delivered.push(senderNameByUserId[u] || u)
    }
    return { read, delivered }
  }

  return (
    <>
      {open && (
        <div
          style={{
            position: 'fixed',
            right: 24,
            bottom: 86,
            width: 760,
            height: 560,
            background: 'linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)',
            border: '1px solid #dbe4ef',
            borderRadius: 18,
            boxShadow: '0 30px 56px -24px rgba(15,23,42,0.5)',
            zIndex: 1100,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: 54,
              background: 'linear-gradient(90deg, #0a1e42 0%, #12356f 100%)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 14 }}>Sohbet</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer' }}
                title="Kapat"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <div
              style={{
                width: 290,
                borderRight: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                backgroundColor: '#fcfdff',
              }}
            >
              <div style={{ padding: 10, borderBottom: '1px solid #eef2f7' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setActiveTab('threads')}
                    style={{
                      flex: 1,
                      height: 34,
                      borderRadius: 9,
                      border: activeTab === 'threads' ? 'none' : '1px solid #cfd9e5',
                      backgroundColor: activeTab === 'threads' ? '#0a1e42' : '#fff',
                      color: activeTab === 'threads' ? '#fff' : '#334155',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Sohbetler
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('people')
                      if (!contacts.length) void loadContacts()
                    }}
                    style={{
                      flex: 1,
                      height: 34,
                      borderRadius: 9,
                      border: activeTab === 'people' ? 'none' : '1px solid #cfd9e5',
                      backgroundColor: activeTab === 'people' ? '#0a1e42' : '#fff',
                      color: activeTab === 'people' ? '#fff' : '#334155',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Kişiler
                  </button>
                </div>
                <input
                  value={activeTab === 'threads' ? threadsSearch : contactSearch}
                  onChange={(e) =>
                    activeTab === 'threads'
                      ? setThreadsSearch(e.target.value)
                      : setContactSearch(e.target.value)
                  }
                  placeholder={activeTab === 'threads' ? 'Sohbet ara...' : 'Kişi ara...'}
                  style={{
                    marginTop: 8,
                    height: 38,
                    width: '100%',
                    borderRadius: 10,
                    border: '1px solid #d2dcea',
                    padding: '0 12px',
                    fontSize: 13,
                  }}
                />
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  padding: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: 8,
                }}
              >
                {activeTab === 'threads' ? (
                  filteredThreads.length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: 13, padding: 3 }}>Sohbet bulunamadı.</div>
                  ) : (
                    filteredThreads.map((c) => {
                      const isActive = String(c.id) === String(activeChannelId)
                      const unread = channelLooksUnread(c)
                      const title = c.displayTitle || 'Sohbet'
                      const previewText =
                        c?.tur === 'grup'
                          ? String(c?.son_mesaj_ozet || '').trim() ||
                            (c?.groupCreatorName
                              ? `${c.groupCreatorName} sizi gruba ekledi`
                              : 'Gruba eklendiniz')
                          : c?.son_mesaj_ozet || '—'
                      const low = normalizeChatUuid(c.dm_user_low)
                      const other = low === uidNorm ? c.dm_user_high : c.dm_user_low
                      const avatarId = avatarByUserId[normalizeChatUuid(other)]
                      const avatarEmoji = avatarEmojiById(avatarId)
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setActiveChannelId(c.id)
                            setActiveTitle(c.displayTitle || 'Sohbet')
                            void loadRoom(c.id)
                          }}
                          style={{
                            textAlign: 'left',
                            border: isActive ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                            borderRadius: 10,
                            padding: '12px 14px',
                            minHeight: 52,
                            width: '100%',
                            cursor: 'pointer',
                            backgroundColor: isActive ? '#f4f9ff' : '#fff',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 999,
                                backgroundColor: isActive ? '#dbeafe' : '#f1f5f9',
                                color: isActive ? '#1d4ed8' : '#64748b',
                                fontSize: 10,
                                fontWeight: 800,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              {avatarEmoji || initials(title)}
                            </span>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                                <div
                                  style={{
                                    fontWeight: unread ? 700 : 600,
                                    color: '#0f172a',
                                    fontSize: 11.5,
                                    lineHeight: 1.15,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {title}
                                </div>
                                <div style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0, lineHeight: 1 }}>
                                  {fmtClock(c.son_mesaj_at || c.created_at)}
                                </div>
                              </div>
                              <div
                                style={{
                                  marginTop: 1,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 8,
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 10.5,
                                    color: unread ? '#475569' : '#94a3b8',
                                    lineHeight: 1.1,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {previewText}
                                </div>
                                {unread ? (
                                  <span
                                    style={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: 999,
                                      backgroundColor: '#22c55e',
                                      flexShrink: 0,
                                    }}
                                  />
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })
                  )
                ) : contactsLoading ? (
                  <div style={{ color: '#64748b', fontSize: 13, padding: 8 }}>Yükleniyor…</div>
                ) : filteredContacts.length === 0 ? (
                  <div style={{ color: '#64748b', fontSize: 13, padding: 8 }}>Kişi bulunamadı.</div>
                ) : (
                  filteredContacts.map((c) => {
                    const fullName = `${c?.ad || ''} ${c?.soyad || ''}`.trim() || c?.email || 'Personel'
                    const avatarId = avatarByUserId[normalizeChatUuid(c?.kullanici_id)]
                    const avatarEmoji = avatarEmojiById(avatarId)
                    return (
                      <button
                        key={c.id || c.kullanici_id}
                        type="button"
                        onClick={() => void openDmWith(c.kullanici_id, fullName)}
                        style={{
                          textAlign: 'left',
                          border: '1px solid #e2e8f0',
                          backgroundColor: '#fff',
                          borderRadius: 10,
                          padding: '10px 12px',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 999,
                              backgroundColor: '#eef2f7',
                              color: '#64748b',
                              fontSize: 10,
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {avatarEmoji || initials(fullName)}
                          </span>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{fullName}</div>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div
                style={{
                  minHeight: 44,
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  padding: '0 12px',
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                  {activeChannelId ? activeTitle : 'Sohbet seçin'}
                </div>
                {groupCreatorLabel ? (
                  <div style={{ fontSize: 11, color: '#64748b' }}>Ekleyen: {groupCreatorLabel}</div>
                ) : null}
                {groupMemberNames.length > 0 ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: '#64748b',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 260,
                      minWidth: 0,
                      flexShrink: 1,
                    }}
                    title={groupMemberNames.join(', ')}
                  >
                    Üyeler: {groupMemberNames.join(', ')}
                  </div>
                ) : null}
              </div>
              <div
                ref={scrollerRef}
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '12px 12px 4px',
                  background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
                }}
              >
                {!activeChannelId ? (
                  <div style={{ color: '#64748b', fontSize: 13, padding: 8 }}>
                    Sol listeden bir sohbet seçin veya Kişiler sekmesinden yeni sohbet başlatın.
                  </div>
                ) : loading ? (
                  <div style={{ color: '#64748b', fontSize: 13, padding: 8 }}>Yükleniyor…</div>
                ) : messages.length === 0 ? (
                  <div style={{ color: '#64748b', fontSize: 13, padding: 8 }}>Henüz mesaj yok.</div>
                ) : (
                  messages.map((m) => {
                    const mine = normalizeChatUuid(m.gonderen_kullanici_id) === uidNorm
                    const senderId = normalizeChatUuid(m.gonderen_kullanici_id)
                    const senderLabel = mine
                      ? 'Siz'
                      : senderNameByUserId[senderId] || (senderId ? `Kullanıcı ${senderId.slice(0, 8)}` : 'Kullanıcı')
                    const hasMedia = m.mesaj_tipi && m.mesaj_tipi !== 'text' && m.ek_yol
                    const receipt = readReceiptUi(m.id, mine)
                    return (
                      <div
                        key={m.id}
                        style={{
                          display: 'flex',
                          justifyContent: mine ? 'flex-end' : 'flex-start',
                          marginBottom: 8,
                        }}
                        onMouseEnter={() => setHoveredMessageId(m.id)}
                        onMouseLeave={() => {
                          setHoveredMessageId((prev) => (String(prev) === String(m.id) ? null : prev))
                          setOpenMenuMessageId((prev) => (String(prev) === String(m.id) ? null : prev))
                        }}
                      >
                        <div
                          style={{
                            maxWidth: '70%',
                            backgroundColor: mine ? '#12356f' : '#fff',
                            color: mine ? '#fff' : '#0f172a',
                            border: mine ? 'none' : '1px solid #e2e8f0',
                            borderRadius: 14,
                            padding: '8px 10px',
                            boxShadow: mine
                              ? '0 10px 18px -16px rgba(18,53,111,0.9)'
                              : '0 8px 14px -16px rgba(15,23,42,0.6)',
                            position: 'relative',
                          }}
                        >
                          {(String(hoveredMessageId) === String(m.id) || String(openMenuMessageId) === String(m.id)) ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenMenuMessageId((prev) => (String(prev) === String(m.id) ? null : m.id))
                              }}
                              style={{
                                position: 'absolute',
                                right: 6,
                                top: 6,
                                width: 18,
                                height: 18,
                                borderRadius: 6,
                                border: '1px solid rgba(148,163,184,0.35)',
                                backgroundColor: mine ? 'rgba(255,255,255,0.18)' : '#f8fafc',
                                color: mine ? '#fff' : '#334155',
                                fontSize: 11,
                                lineHeight: 1,
                                cursor: 'pointer',
                              }}
                              title="Mesaj menüsü"
                            >
                              ▼
                            </button>
                          ) : null}
                          {String(openMenuMessageId) === String(m.id) ? (
                            <div
                              style={{
                                position: 'absolute',
                                right: 6,
                                top: 28,
                                zIndex: 5,
                                borderRadius: 8,
                                border: '1px solid #dbe4ef',
                                backgroundColor: '#fff',
                                boxShadow: '0 8px 16px -10px rgba(15,23,42,0.5)',
                                minWidth: 86,
                                overflow: 'hidden',
                              }}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setOpenMenuMessageId(null)
                                  setSelectedMessage(m)
                                }}
                                style={{
                                  width: '100%',
                                  border: 'none',
                                  background: '#fff',
                                  color: '#0f172a',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  textAlign: 'left',
                                  padding: '8px 10px',
                                  cursor: 'pointer',
                                }}
                              >
                                Bilgi
                              </button>
                            </div>
                          ) : null}
                          <div
                            style={{
                              marginBottom: 4,
                              fontSize: 10.5,
                              fontWeight: 800,
                              color: mine ? 'rgba(255,255,255,0.88)' : '#475569',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {senderLabel}
                          </div>
                          {hasMedia ? <ChatAttachmentInline row={m} mine={mine} /> : null}
                          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{m.icerik || ''}</div>
                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 10.5,
                              color: mine ? 'rgba(255,255,255,0.75)' : '#94a3b8',
                              display: 'flex',
                              justifyContent: 'flex-end',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            <span>{fmtClock(m.olusturulma_at)}</span>
                            {receipt ? (
                              <span style={{ letterSpacing: -2, color: receipt.read ? '#7dd3fc' : 'rgba(255,255,255,0.7)' }}>
                                {receipt.ticks}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              <div
                style={{
                  borderTop: '1px solid #e2e8f0',
                  padding: 8,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <input
                  id="quickchat-media-input"
                  type="file"
                  accept="image/*,video/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    setPendingAttachment(f || null)
                    e.target.value = ''
                  }}
                />
                <input
                  id="quickchat-doc-input"
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    setPendingAttachment(f || null)
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  onClick={() => document.getElementById('quickchat-media-input')?.click()}
                  disabled={!activeChannelId || sending}
                  style={{
                    height: 38,
                    borderRadius: 10,
                    border: '1px solid #d2dcea',
                    backgroundColor: '#fff',
                    color: '#0a1e42',
                    cursor: 'pointer',
                    padding: '0 10px',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                  title="Fotoğraf / video seç"
                >
                  Medya
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById('quickchat-doc-input')?.click()}
                  disabled={!activeChannelId || sending}
                  style={{
                    height: 38,
                    borderRadius: 10,
                    border: '1px solid #d2dcea',
                    backgroundColor: '#fff',
                    color: '#0a1e42',
                    cursor: 'pointer',
                    padding: '0 10px',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                  title="Belge seç"
                >
                  Belge
                </button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={activeChannelId ? 'Mesaj yaz...' : 'Önce sohbet seçin...'}
                  disabled={!activeChannelId}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void onSend()
                    }
                  }}
                  style={{
                    flex: 1,
                    height: 40,
                    borderRadius: 10,
                    border: '1px solid #d2dcea',
                    padding: '0 12px',
                    fontSize: 13,
                    backgroundColor: activeChannelId ? '#fff' : '#f8fafc',
                  }}
                />
                <button
                  type="button"
                  onClick={() => void onSend()}
                  disabled={!activeChannelId || sending || (!String(draft || '').trim() && !pendingAttachment)}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: '#e95422',
                    color: '#fff',
                    cursor: sending ? 'not-allowed' : 'pointer',
                    opacity: !activeChannelId || sending ? 0.65 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Send size={16} />
                </button>
              </div>
              {pendingAttachment ? (
                <div
                  style={{
                    borderTop: '1px solid #eef2f7',
                    padding: '6px 10px',
                    fontSize: 11,
                    color: '#64748b',
                    backgroundColor: '#fff',
                  }}
                >
                  Ek: {pendingAttachment.name}{' '}
                  <button
                    type="button"
                    onClick={() => setPendingAttachment(null)}
                    style={{
                      marginLeft: 8,
                      border: 'none',
                      background: 'transparent',
                      color: '#dc2626',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Kaldır
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          width: 54,
          height: 54,
          borderRadius: 9999,
          border: 'none',
          backgroundColor: '#e95422',
          color: '#fff',
          boxShadow: '0 14px 26px -12px rgba(233,84,34,0.8)',
          zIndex: 1101,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Hızlı sohbet"
      >
        <MessageCircle size={22} />
        {unreadCount > 0 ? (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 20,
              height: 20,
              padding: '0 6px',
              borderRadius: 9999,
              border: '2px solid #fff',
              backgroundColor: '#dc2626',
              color: '#fff',
              fontSize: 11,
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>
      {canQuickAssignTask && !open ? (
        <button
          type="button"
          onClick={() => navigate('/admin/tasks/new')}
          style={{
            position: 'fixed',
            right: 24,
            bottom: 92,
            width: 54,
            height: 54,
            borderRadius: 9999,
            border: '1px solid #93c5fd',
            backgroundColor: '#eff6ff',
            color: '#0b3b8f',
            boxShadow: '0 14px 24px -12px rgba(30,64,175,0.55)',
            zIndex: 1101,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="İş Atama"
        >
          <ListTodo size={22} strokeWidth={2.2} />
        </button>
      ) : null}
      {selectedMessage ? (
        <div
          onClick={() => setSelectedMessage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1250,
            backgroundColor: 'rgba(2,6,23,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 360,
              maxWidth: '92vw',
              borderRadius: 14,
              border: '1px solid #dbe4ef',
              backgroundColor: '#fff',
              padding: 14,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Mesaj bilgisi</div>
            {(() => {
              const info = buildMessageAudit(selectedMessage)
              return (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>Okuyanlar</div>
                  <div style={{ fontSize: 12, color: '#334155', marginBottom: 10 }}>{info.read.length ? info.read.join(', ') : 'Henüz yok'}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', marginBottom: 4 }}>İletilenler</div>
                  <div style={{ fontSize: 12, color: '#334155' }}>{info.delivered.length ? info.delivered.join(', ') : 'Yok'}</div>
                </>
              )
            })()}
          </div>
        </div>
      ) : null}
    </>
  )
}
