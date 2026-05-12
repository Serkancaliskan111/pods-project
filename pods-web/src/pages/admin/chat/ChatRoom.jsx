import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import getSupabase from '../../../lib/supabaseClient'
import {
  fetchMessages,
  sendMessage,
  markRead,
  subscribeRoomInserts,
  fetchKanal,
  resolveChannelTitles,
  normalizeChatUuid,
  sortMessagesByIdAsc,
  CHAT_MESSAGES_PAGE_SIZE,
  CHAT_RESYNC_DEBOUNCE_MS,
  CHAT_OLDER_MESSAGES_BATCH,
  uploadChatBlob,
  inferMesajTipiFromMime,
  fetchChannelMemberReadStates,
  fetchPeersPresenceMap,
  maxPeerReadMessageId,
  subscribeMembershipReadStates,
  subscribePeerPresenceRow,
  createChatAttachmentSignedUrl,
  isChatPresenceFresh,
} from '../../../lib/chatApi'

function formatChatPresence(p) {
  if (!p) return ''
  const fresh = isChatPresenceFresh(p.mobil_last_seen_at)
  if (p.mobil_online && fresh) return 'Çevrimiçi'
  if (p.mobil_last_seen_at) {
    return `Son görülme ${new Date(p.mobil_last_seen_at).toLocaleString('tr-TR', {
      dateStyle: 'short',
      timeStyle: 'short',
    })}`
  }
  return 'Çevrimdışı'
}

function mergeMemberReads(prev, row) {
  if (!row?.kullanici_id) return prev
  const uid = normalizeChatUuid(row.kullanici_id)
  const next = [...prev]
  const i = next.findIndex((r) => normalizeChatUuid(r.kullanici_id) === uid)
  if (i >= 0) {
    next[i] = { ...next[i], ...row }
    return next
  }
  next.push({
    kullanici_id: row.kullanici_id,
    son_okunan_mesaj_id: row.son_okunan_mesaj_id ?? null,
  })
  return next
}

function readReceiptUi(msgId, mine, isDm, peerMaxRead) {
  if (!mine) return null
  if (!isDm) {
    return { ticks: '✓', read: false, title: 'Gönderildi' }
  }
  if (peerMaxRead == null) {
    return { ticks: '✓', read: false, title: 'İletildi' }
  }
  let ge = false
  try {
    ge = BigInt(String(peerMaxRead)) >= BigInt(String(msgId))
  } catch {
    ge = Number(peerMaxRead) >= Number(msgId)
  }
  return ge
    ? { ticks: '✓✓', read: true, title: 'Görüldü' }
    : { ticks: '✓✓', read: false, title: 'İletildi' }
}

function ChatMediaLightbox({ open, onClose, url, kind }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !url) return null

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10002,
        backgroundColor: 'rgba(0,0,0,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        cursor: 'zoom-out',
      }}
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <button
        type="button"
        aria-label="Kapat"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 10003,
          width: 44,
          height: 44,
          borderRadius: 12,
          border: 'none',
          backgroundColor: 'rgba(255,255,255,0.15)',
          color: '#fff',
          fontSize: 22,
          fontWeight: 800,
          cursor: 'pointer',
        }}
      >
        ×
      </button>
      {kind === 'image' ? (
        <img
          src={url}
          alt=""
          style={{
            maxWidth: 'min(96vw, 1200px)',
            maxHeight: '88vh',
            objectFit: 'contain',
            borderRadius: 8,
            cursor: 'default',
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <video
          src={url}
          controls
          playsInline
          autoPlay
          style={{
            maxWidth: 'min(96vw, 1200px)',
            maxHeight: '88vh',
            borderRadius: 8,
            cursor: 'default',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <track kind="captions" />
        </video>
      )}
    </div>
  )
}

function ChatAttachmentBody({ row, mine }) {
  const [url, setUrl] = useState(null)
  const [err, setErr] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerKind, setViewerKind] = useState('image')

  useEffect(() => {
    let alive = true
    const yol = row?.ek_yol
    if (!yol) return undefined
    createChatAttachmentSignedUrl(yol, 3600)
      .then((u) => {
        if (alive) setUrl(u)
      })
      .catch(() => {
        if (alive) setErr(true)
      })
    return () => {
      alive = false
    }
  }, [row?.ek_yol])

  useEffect(() => {
    if (!viewerOpen) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [viewerOpen])

  const tip = row?.mesaj_tipi || 'file'
  const captionMuted = mine ? 'rgba(255,255,255,0.82)' : '#64748b'

  const openViewer = (kind) => {
    setViewerKind(kind)
    setViewerOpen(true)
  }

  if (err || (!url && row?.ek_yol)) {
    return (
      <div style={{ fontSize: 13, opacity: 0.9 }}>
        Ek yüklenemedi
        {row?.ek_orijinal_ad ? ` (${row.ek_orijinal_ad})` : ''}
      </div>
    )
  }

  if (tip === 'image' && url) {
    return (
      <>
        <button
          type="button"
          onClick={() => openViewer('image')}
          title="Büyütmek için tıklayın"
          style={{
            padding: 0,
            margin: 0,
            border: 'none',
            background: 'transparent',
            cursor: 'zoom-in',
            borderRadius: 12,
            overflow: 'hidden',
            display: 'block',
            maxWidth: 260,
          }}
        >
          <img src={url} alt="" style={{ width: '100%', borderRadius: 12, display: 'block' }} />
        </button>
        <ChatMediaLightbox open={viewerOpen && viewerKind === 'image'} onClose={() => setViewerOpen(false)} url={url} kind="image" />
      </>
    )
  }

  if (tip === 'video' && url) {
    return (
      <>
        <button
          type="button"
          onClick={() => openViewer('video')}
          title="Tam ekran oynatmak için tıklayın"
          style={{
            padding: 0,
            margin: 0,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            borderRadius: 12,
            overflow: 'hidden',
            display: 'block',
            position: 'relative',
            maxWidth: 260,
          }}
        >
          <video
            src={`${url}#t=0.1`}
            muted
            playsInline
            preload="metadata"
            style={{ width: '100%', display: 'block', borderRadius: 12, pointerEvents: 'none' }}
          >
            <track kind="captions" />
          </video>
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0,0,0,0.4)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 15,
              pointerEvents: 'none',
              borderRadius: 12,
            }}
          >
            ▶ Oynat
          </span>
        </button>
        <ChatMediaLightbox open={viewerOpen && viewerKind === 'video'} onClose={() => setViewerOpen(false)} url={url} kind="video" />
      </>
    )
  }

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        style={{
          color: mine ? '#fff' : '#0a1e42',
          fontWeight: 700,
          textDecoration: 'underline',
          fontSize: 14,
          wordBreak: 'break-word',
        }}
      >
        📎 {row?.ek_orijinal_ad || 'Dosyayı aç'}
      </a>
    )
  }

  return <div style={{ fontSize: 13, color: captionMuted }}>Ek hazırlanıyor…</div>
}

export default function ChatRoomPage() {
  const { channelId: routeChannelId } = useParams()
  const channelId = normalizeChatUuid(routeChannelId)
  const { user, personel } = useContext(AuthContext)
  const uid = user?.id
  const uidNorm = normalizeChatUuid(uid)
  const companyId = personel?.ana_sirket_id

  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const [headerTitle, setHeaderTitle] = useState('Sohbet')
  const [kanalMeta, setKanalMeta] = useState(null)
  const [memberReads, setMemberReads] = useState([])
  const [peerPresence, setPeerPresence] = useState(null)
  const [senderNameByUserId, setSenderNameByUserId] = useState({})
  const [selectedMessage, setSelectedMessage] = useState(null)
  const [hoveredMessageId, setHoveredMessageId] = useState(null)
  const [openMenuMessageId, setOpenMenuMessageId] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlder, setHasOlder] = useState(true)
  const bottomRef = useRef(null)
  const scrollerRef = useRef(null)
  const prependScrollRef = useRef(null)
  const visTimerRef = useRef(null)
  const firstMsgIdRef = useRef(null)
  const fileInputRef = useRef(null)
  const documentInputRef = useRef(null)
  const cameraPhotoInputRef = useRef(null)
  const cameraVideoInputRef = useRef(null)

  const isDm = kanalMeta?.tur === 'birebir'

  const dmPeerId = useMemo(() => {
    if (!kanalMeta || kanalMeta.tur !== 'birebir' || !uidNorm) return null
    const low = normalizeChatUuid(kanalMeta.dm_user_low)
    const other = low === uidNorm ? kanalMeta.dm_user_high : kanalMeta.dm_user_low
    return normalizeChatUuid(other)
  }, [kanalMeta, uidNorm])

  const peerMaxReadId = useMemo(
    () => (uid ? maxPeerReadMessageId(memberReads, uid) : null),
    [memberReads, uid],
  )

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const applyKanalHeader = useCallback(
    async (k) => {
      if (!k || !uid || !companyId) return
      setKanalMeta(k)
      try {
        const [withTitle] = await resolveChannelTitles([{ ...k, _membership: {} }], uid, companyId)
        if (withTitle?.displayTitle) setHeaderTitle(withTitle.displayTitle)
      } catch {
        /* ignore */
      }
    },
    [uid, companyId],
  )

  const loadInitial = useCallback(async () => {
    if (!channelId || !uid) return
    setLoading(true)
    let rows = []
    try {
      rows = await fetchMessages(channelId, { limit: CHAT_MESSAGES_PAGE_SIZE })
      setMessages(sortMessagesByIdAsc(rows))
      setHasOlder(rows.length >= CHAT_MESSAGES_PAGE_SIZE)
      try {
        const k = await fetchKanal(channelId)
        if (k) await applyKanalHeader(k)
      } catch {
        /* kanal meta hatası mesajları gizlemesin */
      }
      try {
        const reads = await fetchChannelMemberReadStates(channelId)
        setMemberReads(reads)
      } catch {
        setMemberReads([])
      }
      const last = rows[rows.length - 1]
      if (last?.id != null) await markRead(channelId, last.id)
    } catch (e) {
      console.warn('[ChatRoom]', e?.message || e)
      setMessages([])
    } finally {
      setLoading(false)
      requestAnimationFrame(scrollToBottom)
    }
  }, [channelId, uid, scrollToBottom, applyKanalHeader])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  useEffect(() => {
    if (!channelId) {
      setSenderNameByUserId({})
      return
    }
    let cancelled = false
    void fetchChannelMembers(channelId, companyId)
      .then((members) => {
        if (cancelled) return
        const map = {}
        for (const m of members || []) {
          const k = normalizeChatUuid(m?.kullanici_id)
          if (!k) continue
          map[k] = String(m?.ad_soyad || '').trim() || `Kullanıcı ${k.slice(0, 8)}`
        }
        setSenderNameByUserId(map)
      })
      .catch(() => {
        if (!cancelled) setSenderNameByUserId({})
      })
    return () => {
      cancelled = true
    }
  }, [channelId, companyId])

  useEffect(() => {
    setHasOlder(true)
    setPendingFile(null)
  }, [channelId])

  useEffect(() => {
    firstMsgIdRef.current = messages[0]?.id ?? null
  }, [messages])

  useEffect(() => {
    if (!channelId) return undefined
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      if (visTimerRef.current) window.clearTimeout(visTimerRef.current)
      visTimerRef.current = window.setTimeout(() => {
        void fetchKanal(channelId)
          .then((k) => k && applyKanalHeader(k))
          .catch(() => {})
        void fetchMessages(channelId, { limit: CHAT_MESSAGES_PAGE_SIZE })
          .then((rows) => setMessages(sortMessagesByIdAsc(rows)))
          .catch(() => {})
      }, CHAT_RESYNC_DEBOUNCE_MS)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      if (visTimerRef.current) window.clearTimeout(visTimerRef.current)
    }
  }, [channelId, applyKanalHeader])

  useEffect(() => {
    if (!channelId) return undefined
    const unsub = subscribeRoomInserts(channelId, (row) => {
      if (!row?.id) return
      setMessages((prev) => {
        if (prev.some((p) => String(p.id) === String(row.id))) return prev
        return sortMessagesByIdAsc([...prev, row])
      })
      if (
        row.gonderen_kullanici_id &&
        normalizeChatUuid(row.gonderen_kullanici_id) !== uidNorm
      ) {
        void markRead(channelId, row.id)
      }
      requestAnimationFrame(scrollToBottom)
    })
    return unsub
  }, [channelId, uidNorm, scrollToBottom])

  useEffect(() => {
    if (!channelId) return undefined
    const unsub = subscribeMembershipReadStates(channelId, (row) => {
      setMemberReads((prev) => mergeMemberReads(prev, row))
    })
    return unsub
  }, [channelId])

  useEffect(() => {
    if (!dmPeerId || !companyId) {
      setPeerPresence(null)
      return undefined
    }
    let cancelled = false
    void fetchPeersPresenceMap(companyId, [dmPeerId]).then((m) => {
      if (!cancelled) setPeerPresence(m[dmPeerId] || null)
    })
    const unsub = subscribePeerPresenceRow(dmPeerId, (row) => {
      setPeerPresence({
        mobil_online: !!row?.mobil_online,
        mobil_last_seen_at: row?.mobil_last_seen_at ?? null,
      })
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [dmPeerId, companyId])

  useEffect(() => {
    if (!channelId || !personel?.id || !user?.id) return undefined
    const supabase = getSupabase()
    const tick = () => {
      void supabase
        .from('personeller')
        .update({ mobil_last_seen_at: new Date().toISOString() })
        .eq('id', personel.id)
        .eq('kullanici_id', user.id)
    }
    tick()
    const iv = window.setInterval(tick, 35000)
    return () => window.clearInterval(iv)
  }, [channelId, personel?.id, user?.id])

  const loadOlder = useCallback(async () => {
    const firstId = firstMsgIdRef.current
    if (loadingOlder || !hasOlder || !channelId || firstId == null) return
    const el = scrollerRef.current
    if (el) {
      prependScrollRef.current = {
        prevH: el.scrollHeight,
        prevT: el.scrollTop,
      }
    }
    setLoadingOlder(true)
    try {
      const older = await fetchMessages(channelId, {
        beforeId: firstId,
        limit: CHAT_OLDER_MESSAGES_BATCH,
      })
      if (older.length < CHAT_OLDER_MESSAGES_BATCH) setHasOlder(false)
      if (older.length) {
        setMessages((prev) => sortMessagesByIdAsc([...older, ...prev]))
      } else {
        prependScrollRef.current = null
      }
    } catch {
      prependScrollRef.current = null
    } finally {
      setLoadingOlder(false)
    }
  }, [channelId, loadingOlder, hasOlder])

  useLayoutEffect(() => {
    const meta = prependScrollRef.current
    const el = scrollerRef.current
    if (!meta || !el) return
    const delta = el.scrollHeight - meta.prevH
    el.scrollTop = meta.prevT + delta
    prependScrollRef.current = null
  }, [messages])

  const onSend = useCallback(async () => {
    const t = draft.trim()
    const file = pendingFile
    if ((!t && !file) || !channelId || sending) return
    setSending(true)
    const draftBackup = draft
    const fileBackup = pendingFile
    setDraft('')
    setPendingFile(null)
    try {
      let mid
      if (file) {
        const uploaded = await uploadChatBlob(channelId, file, {
          contentType: file.type || undefined,
          fileName: file.name,
        })
        const tip = inferMesajTipiFromMime(file.type)
        mid = await sendMessage(channelId, t, {
          mesaj_tipi: tip,
          ek_yol: uploaded.ek_yol,
          ek_orijinal_ad: uploaded.ek_orijinal_ad,
          ek_mime: uploaded.ek_mime,
          ek_boyut: uploaded.ek_boyut ?? file.size ?? null,
        })
      } else {
        mid = await sendMessage(channelId, t)
      }
      await new Promise((r) => setTimeout(r, 120))
      let rows = await fetchMessages(channelId, { limit: CHAT_MESSAGES_PAGE_SIZE })
      let verified =
        mid != null &&
        mid !== '' &&
        rows.some((r) => String(r.id) === String(mid))
      if (!verified && mid != null && mid !== '') {
        await new Promise((r) => setTimeout(r, 280))
        rows = await fetchMessages(channelId, { limit: CHAT_MESSAGES_PAGE_SIZE })
        verified = rows.some((r) => String(r.id) === String(mid))
      }
      setMessages(sortMessagesByIdAsc(rows))
      setHasOlder(rows.length >= CHAT_MESSAGES_PAGE_SIZE)
      if (!verified && mid != null && mid !== '') {
        toast.warning(
          'Mesaj listede görünmedi. Supabase SQL migration’larını (özellikle chat) kontrol edin.',
        )
      }
      const last = rows[rows.length - 1]
      if (last?.id != null) {
        try {
          await markRead(channelId, last.id)
        } catch {
          /* ignore */
        }
      }
      requestAnimationFrame(scrollToBottom)
    } catch (e) {
      const msg = e?.message || String(e)
      console.warn('[ChatRoom send]', msg)
      toast.error(msg ? `Mesaj gönderilemedi: ${msg}` : 'Mesaj gönderilemedi')
      setDraft(draftBackup)
      setPendingFile(fileBackup)
    } finally {
      setSending(false)
    }
  }, [draft, pendingFile, channelId, sending, scrollToBottom])

  const onKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void onSend()
      }
    },
    [onSend],
  )

  const bubbleStyles = useMemo(
    () => ({
      mine: {
        alignSelf: 'flex-end',
        backgroundColor: '#0a1e42',
        color: '#fff',
        borderRadius: '16px 16px 4px 16px',
      },
      theirs: {
        alignSelf: 'flex-start',
        backgroundColor: '#fff',
        color: '#0f172a',
        border: '1px solid #e2e8f0',
        borderRadius: '16px 16px 16px 4px',
      },
    }),
    [],
  )

  const canSend = (!!draft.trim() || !!pendingFile) && !sending

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

  if (!channelId) {
    return (
      <div style={{ padding: 24 }}>
        <p>Kanal bulunamadı.</p>
        <Link to="/admin/chat">Listeye dön</Link>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', maxHeight: '900px' }}>
      <div
        style={{
          flexShrink: 0,
          padding: '16px 20px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          backgroundColor: '#fff',
        }}
      >
        <Link to="/admin/chat" style={{ color: '#0a1e42', fontWeight: 700, textDecoration: 'none', fontSize: 14 }}>
          ← Sohbetler
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{headerTitle}</h1>
          {isDm ? (
            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: '#64748b' }}>
              {formatChatPresence(peerPresence)}
            </div>
          ) : null}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          setPendingFile(f || null)
          e.target.value = ''
        }}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          setPendingFile(f || null)
          e.target.value = ''
        }}
      />
      <input
        ref={cameraPhotoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          setPendingFile(f || null)
          e.target.value = ''
        }}
      />
      <input
        ref={cameraVideoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          setPendingFile(f || null)
          e.target.value = ''
        }}
      />

      <div
        ref={scrollerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px',
          backgroundColor: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {loading ? (
          <p style={{ color: '#64748b' }}>Yükleniyor…</p>
        ) : (
          <>
            {hasOlder ? (
              <button
                type="button"
                onClick={() => void loadOlder()}
                disabled={loadingOlder}
                style={{
                  alignSelf: 'center',
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#fff',
                  color: '#0a1e42',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: loadingOlder ? 'wait' : 'pointer',
                  marginBottom: 4,
                }}
              >
                {loadingOlder ? 'Yükleniyor…' : 'Daha eski mesajlar'}
              </button>
            ) : null}
            {messages.map((item) => {
              const mine = normalizeChatUuid(item.gonderen_kullanici_id) === uidNorm
              const senderId = normalizeChatUuid(item.gonderen_kullanici_id)
              const senderLabel = mine
                ? 'Siz'
                : senderNameByUserId[senderId] || (senderId ? `Kullanıcı ${senderId.slice(0, 8)}` : 'Kullanıcı')
              const time =
                item.olusturulma_at &&
                new Date(item.olusturulma_at).toLocaleTimeString('tr-TR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              const bs = mine ? bubbleStyles.mine : bubbleStyles.theirs
              const hasMedia = item.mesaj_tipi && item.mesaj_tipi !== 'text' && item.ek_yol
              const receipt = readReceiptUi(item.id, mine, isDm, peerMaxReadId)
              const cap = (item.icerik || '').trim()

              return (
                <div
                  key={item.id}
                  style={{
                    ...bs,
                    maxWidth: '78%',
                    padding: '10px 14px',
                    boxSizing: 'border-box',
                    position: 'relative',
                  }}
                  onMouseEnter={() => setHoveredMessageId(item.id)}
                  onMouseLeave={() => {
                    setHoveredMessageId((prev) => (String(prev) === String(item.id) ? null : prev))
                    setOpenMenuMessageId((prev) => (String(prev) === String(item.id) ? null : prev))
                  }}
                >
                  {(String(hoveredMessageId) === String(item.id) || String(openMenuMessageId) === String(item.id)) ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenMenuMessageId((prev) => (String(prev) === String(item.id) ? null : item.id))
                      }}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: 8,
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
                  {String(openMenuMessageId) === String(item.id) ? (
                    <div
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: 30,
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
                          setSelectedMessage(item)
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
                      marginBottom: 6,
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: 0.1,
                      color: mine ? 'rgba(255,255,255,0.9)' : '#334155',
                    }}
                  >
                    {senderLabel}
                  </div>
                  {hasMedia ? <ChatAttachmentBody row={item} mine={mine} /> : null}
                  {cap ? (
                    <div
                      style={{
                        marginTop: hasMedia ? 8 : 0,
                        fontSize: 15,
                        lineHeight: 1.45,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {item.icerik}
                    </div>
                  ) : null}
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 10,
                      fontWeight: 600,
                      opacity: mine ? 0.75 : 1,
                      color: mine ? 'rgba(255,255,255,0.85)' : '#64748b',
                      textAlign: 'right',
                      display: 'flex',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {time ? <span>{time}</span> : null}
                    {receipt ? (
                      <span
                        title={receipt.title}
                        style={{
                          letterSpacing: -2,
                          color: receipt.read ? '#7dd3fc' : 'rgba(255,255,255,0.65)',
                          fontSize: 11,
                        }}
                      >
                        {receipt.ticks}
                      </span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <div
        style={{
          flexShrink: 0,
          padding: '12px 16px 18px',
          borderTop: '1px solid #e2e8f0',
          backgroundColor: '#fff',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          disabled={sending}
          onClick={() => fileInputRef.current?.click()}
          title="Fotoğraf veya video seç"
          style={{
            border: '1px solid #e2e8f0',
            backgroundColor: '#fff',
            borderRadius: 12,
            padding: '10px 12px',
            fontWeight: 700,
            fontSize: 13,
            color: '#0a1e42',
            cursor: sending ? 'wait' : 'pointer',
            height: 44,
          }}
        >
          Medya
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={() => documentInputRef.current?.click()}
          title="PDF veya Word belgesi yükle"
          style={{
            border: '1px solid #e2e8f0',
            backgroundColor: '#fff',
            borderRadius: 12,
            padding: '10px 12px',
            fontWeight: 700,
            fontSize: 13,
            color: '#0a1e42',
            cursor: sending ? 'wait' : 'pointer',
            height: 44,
          }}
        >
          Belge
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={() => cameraPhotoInputRef.current?.click()}
          title="Kamera ile fotoğraf çek"
          style={{
            border: '1px solid #e2e8f0',
            backgroundColor: '#fff',
            borderRadius: 12,
            padding: '10px 12px',
            fontWeight: 700,
            fontSize: 13,
            color: '#0a1e42',
            cursor: sending ? 'wait' : 'pointer',
            height: 44,
          }}
        >
          📷
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={() => cameraVideoInputRef.current?.click()}
          title="Kamera ile video kaydet"
          style={{
            border: '1px solid #e2e8f0',
            backgroundColor: '#fff',
            borderRadius: 12,
            padding: '10px 12px',
            fontWeight: 700,
            fontSize: 13,
            color: '#0a1e42',
            cursor: sending ? 'wait' : 'pointer',
            height: 44,
          }}
        >
          🎬
        </button>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Mesaj veya açıklama… (Enter gönderir)"
          rows={2}
          maxLength={8000}
          disabled={sending}
          style={{
            flex: '1 1 200px',
            resize: 'vertical',
            minHeight: 44,
            maxHeight: 160,
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            padding: '10px 12px',
            fontSize: 15,
            fontFamily: 'inherit',
          }}
        />
        <button
          type="button"
          onClick={() => void onSend()}
          disabled={!canSend}
          style={{
            backgroundColor: canSend ? '#e95422' : '#cbd5e1',
            color: '#fff',
            fontWeight: 800,
            border: 'none',
            borderRadius: 12,
            padding: '12px 18px',
            cursor: canSend ? 'pointer' : 'not-allowed',
            height: 44,
          }}
        >
          Gönder
        </button>
        {pendingFile ? (
          <div style={{ width: '100%', fontSize: 12, color: '#64748b', fontWeight: 600 }}>
            Seçili: {pendingFile.name}{' '}
            <button type="button" style={{ marginLeft: 8 }} onClick={() => setPendingFile(null)}>
              Kaldır
            </button>
          </div>
        ) : null}
      </div>
      {selectedMessage ? (
        <div
          onClick={() => setSelectedMessage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10020,
            backgroundColor: 'rgba(2,6,23,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 380,
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
    </div>
  )
}
