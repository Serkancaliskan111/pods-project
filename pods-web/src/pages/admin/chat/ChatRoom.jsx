import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { useChatShellOptional } from './ChatShellContext.jsx'
import { ChevronLeft, Paperclip, Send, Smile } from 'lucide-react'
import { toast } from 'sonner'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import getSupabase from '../../../lib/supabaseClient'
import {
  fetchMessages,
  sendMessage,
  markRead,
  subscribeRoomInserts,
  fetchKanal,
  fetchChannelMembers,
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
  isChatPresenceFresh,
} from '../../../lib/chatApi'
import { chatInitials, chatWa } from './chatTheme.js'
import {
  getCachedChannel,
  getChannelDraft,
  setCachedChannel,
  setChannelDraft,
} from './chatChannelCache.js'
import { prefetchAttachmentUrls } from './chatAttachmentCache.js'
import ChatAttachmentBody from './ChatAttachmentBody.jsx'
import ChatEmojiPicker from './ChatEmojiPicker.jsx'
import {
  CHAT_FILE_INPUT_ACCEPT,
  chatAttachmentRejectionMessage,
  isChatAttachmentAllowed,
} from '../../../lib/chatAttachmentTypes.js'
import './chat.css'

function buildSenderNameMap(members) {
  const map = {}
  for (const m of members || []) {
    const k = normalizeChatUuid(m?.kullanici_id)
    if (!k) continue
    const name = String(m?.ad_soyad || '').trim()
    if (name) map[k] = name
  }
  return map
}

function shouldShowMessageCaption(item, hasMedia) {
  const cap = (item?.icerik || '').trim()
  if (!cap || !hasMedia) return !!cap
  const yol = String(item?.ek_yol || '')
  if (yol && (cap === yol || cap.endsWith(yol) || yol.endsWith(cap))) return false
  if (item?.ek_orijinal_ad && cap === item.ek_orijinal_ad) return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cap)) return false
  if (cap.includes('/') && !/\s/.test(cap)) return false
  return true
}

function mediaPathsFromMessages(msgs, limit = 24) {
  return (msgs || [])
    .filter((m) => m?.ek_yol && m.mesaj_tipi && m.mesaj_tipi !== 'text')
    .map((m) => m.ek_yol)
    .slice(-limit)
}

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


export default function ChatRoomPage({ embedded: embeddedProp, channelId: channelIdProp }) {
  const shell = useChatShellOptional()
  const compact = shell?.density === 'compact'
  const { embedded: embeddedFromOutlet } = useOutletContext() || {}
  const embedded = embeddedProp ?? embeddedFromOutlet ?? false
  const { channelId: routeChannelId } = useParams()
  const channelId = normalizeChatUuid(channelIdProp ?? routeChannelId)
  const { user, personel } = useContext(AuthContext)
  const uid = user?.id
  const uidNorm = normalizeChatUuid(uid)
  const companyId = personel?.ana_sirket_id

  const [messages, setMessages] = useState([])
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
  const [scrollAnchored, setScrollAnchored] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const bottomRef = useRef(null)
  const scrollerRef = useRef(null)
  const draftInputRef = useRef(null)
  const emojiBtnRef = useRef(null)
  const prependScrollRef = useRef(null)
  const pinBottomRef = useRef(true)
  const visTimerRef = useRef(null)
  const firstMsgIdRef = useRef(null)
  const fileInputRef = useRef(null)
  const cameraPhotoInputRef = useRef(null)
  const cameraVideoInputRef = useRef(null)
  const prevChannelRef = useRef(null)
  const draftSnapshotRef = useRef('')
  const activeChannelRef = useRef(channelId)

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

  const scrollToBottom = useCallback(
    (smooth = true) => {
      const el = scrollerRef.current
      if (!el) return
      if (smooth) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      } else {
        el.scrollTop = el.scrollHeight
      }
    },
    [],
  )

  const onScrollerScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    pinBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }, [])

  const applyKanalHeader = useCallback(
    async (k) => {
      if (!k || !uid || !companyId || !channelId) return
      setKanalMeta(k)
      try {
        const [withTitle] = await resolveChannelTitles([{ ...k, _membership: {} }], uid, companyId)
        if (withTitle?.displayTitle) {
          setHeaderTitle(withTitle.displayTitle)
          const prev = getCachedChannel(channelId) || {}
          setCachedChannel(channelId, {
            ...prev,
            headerTitle: withTitle.displayTitle,
            kanalMeta: k,
          })
        }
      } catch {
        /* ignore */
      }
    },
    [uid, companyId, channelId],
  )

  const persistChannelCache = useCallback(
    (overrides = {}) => {
      if (!channelId) return
      setCachedChannel(channelId, {
        messages,
        headerTitle,
        kanalMeta,
        memberReads,
        senderNameByUserId,
        hasOlder,
        ...overrides,
      })
    },
    [channelId, messages, headerTitle, kanalMeta, memberReads, senderNameByUserId, hasOlder],
  )

  const loadInitial = useCallback(
    async ({ forChannelId = channelId } = {}) => {
      if (!forChannelId || !uid) return
      pinBottomRef.current = true
      let reads = []
      let k = null
      try {
        const [rows, members] = await Promise.all([
          fetchMessages(forChannelId, { limit: CHAT_MESSAGES_PAGE_SIZE }),
          fetchChannelMembers(forChannelId, companyId).catch(() => []),
        ])
        if (activeChannelRef.current !== forChannelId) return
        const sorted = sortMessagesByIdAsc(rows)
        const nameMap = buildSenderNameMap(members)
        setSenderNameByUserId(nameMap)
        setMessages(sorted)
        setHasOlder(rows.length >= CHAT_MESSAGES_PAGE_SIZE)
        void prefetchAttachmentUrls(mediaPathsFromMessages(sorted))
        try {
          k = await fetchKanal(forChannelId)
          if (k && activeChannelRef.current === forChannelId) await applyKanalHeader(k)
        } catch {
          /* kanal meta hatası mesajları gizlemesin */
        }
        try {
          reads = await fetchChannelMemberReadStates(forChannelId)
          if (activeChannelRef.current === forChannelId) setMemberReads(reads)
        } catch {
          if (activeChannelRef.current === forChannelId) setMemberReads([])
          reads = []
        }
        const last = sorted[sorted.length - 1]
        if (last?.id != null) await markRead(forChannelId, last.id)
        const prevCache = getCachedChannel(forChannelId) || {}
        setCachedChannel(forChannelId, {
          ...prevCache,
          messages: sorted,
          senderNameByUserId: nameMap,
          kanalMeta: k ?? prevCache.kanalMeta ?? null,
          memberReads: reads,
          hasOlder: rows.length >= CHAT_MESSAGES_PAGE_SIZE,
        })
      } catch (e) {
        console.warn('[ChatRoom]', e?.message || e)
        if (activeChannelRef.current === forChannelId) setMessages([])
      }
    },
    [channelId, uid, companyId, applyKanalHeader],
  )

  useEffect(() => {
    draftSnapshotRef.current = draft
  }, [draft])

  useLayoutEffect(() => {
    activeChannelRef.current = channelId
    const prevId = prevChannelRef.current
    if (prevId && prevId !== channelId) {
      setChannelDraft(prevId, draftSnapshotRef.current)
    }
    prevChannelRef.current = channelId

    setSelectedMessage(null)
    setHoveredMessageId(null)
    setOpenMenuMessageId(null)
    setPendingFile(null)
    setEmojiOpen(false)

    pinBottomRef.current = true
    setScrollAnchored(false)

    const cached = getCachedChannel(channelId)
    if (cached) {
      setMessages(cached.messages || [])
      setHeaderTitle(cached.headerTitle || 'Sohbet')
      setKanalMeta(cached.kanalMeta ?? null)
      setMemberReads(cached.memberReads || [])
      setSenderNameByUserId(cached.senderNameByUserId || {})
      setHasOlder(cached.hasOlder ?? true)
      void prefetchAttachmentUrls(mediaPathsFromMessages(cached.messages || []))
    } else {
      setMessages([])
      setHeaderTitle('Sohbet')
      setKanalMeta(null)
      setMemberReads([])
      setSenderNameByUserId({})
      setHasOlder(true)
    }

    setDraft(getChannelDraft(channelId))
  }, [channelId])

  useEffect(() => {
    if (!channelId || !uid) return
    void loadInitial()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca kanal değişiminde yükle
  }, [channelId, uid])

  useEffect(() => {
    if (!channelId) return
    persistChannelCache()
  }, [channelId, persistChannelCache])

  useEffect(() => {
    if (!channelId || !companyId) return undefined
    const cached = getCachedChannel(channelId)
    if (cached?.senderNameByUserId && Object.keys(cached.senderNameByUserId).length > 0) {
      return undefined
    }
    let cancelled = false
    void fetchChannelMembers(channelId, companyId)
      .then((members) => {
        if (cancelled) return
        const map = buildSenderNameMap(members)
        setSenderNameByUserId(map)
        const prev = getCachedChannel(channelId) || {}
        setCachedChannel(channelId, { ...prev, senderNameByUserId: map })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [channelId, companyId])

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
      if (pinBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom(true))
      }
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
    pinBottomRef.current = false
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
    const el = scrollerRef.current
    if (!el) return
    const meta = prependScrollRef.current
    if (meta) {
      const delta = el.scrollHeight - meta.prevH
      el.scrollTop = meta.prevT + delta
      prependScrollRef.current = null
      return
    }
    if (pinBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
    setScrollAnchored(true)
  }, [messages, channelId])

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
      pinBottomRef.current = true
      requestAnimationFrame(() => scrollToBottom(true))
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

  const insertEmoji = useCallback((emoji) => {
    const el = draftInputRef.current
    if (!el) {
      setDraft((prev) => `${prev}${emoji}`)
      return
    }
    const start = el.selectionStart ?? draft.length
    const end = el.selectionEnd ?? draft.length
    const next = draft.slice(0, start) + emoji + draft.slice(end)
    if (next.length > 8000) return
    setDraft(next)
    const pos = start + emoji.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }, [draft])

  const toggleEmojiPicker = useCallback(() => {
    setEmojiOpen((v) => !v)
  }, [])

  const onAttachmentSelected = useCallback((file) => {
    if (!file) return
    if (!isChatAttachmentAllowed({ mime: file.type, fileName: file.name })) {
      toast.error(chatAttachmentRejectionMessage())
      return
    }
    setPendingFile(file)
  }, [])

  const onEmojiPick = useCallback(
    (emoji) => {
      insertEmoji(emoji)
    },
    [insertEmoji],
  )

  const onKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        setEmojiOpen(false)
        void onSend()
      }
    },
    [onSend],
  )

  const bubbleStyles = useMemo(
    () => ({
      mine: {
        alignSelf: 'flex-end',
        backgroundColor: chatWa.bubbleOut,
        color: chatWa.bubbleOutText,
        borderRadius: '12px 12px 4px 12px',
        boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)',
      },
      theirs: {
        alignSelf: 'flex-start',
        backgroundColor: chatWa.bubbleIn,
        color: chatWa.bubbleInText,
        border: `1px solid ${chatWa.border}`,
        borderRadius: '12px 12px 12px 4px',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
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
    <div className="chat-wa-room">
      <div className="chat-wa-room__header">
        {shell ? (
          <button
            type="button"
            onClick={shell.openEmpty}
            className="chat-wa-icon-btn md:!hidden"
            aria-label="Sohbet listesine dön"
          >
            <ChevronLeft size={compact ? 20 : 24} />
          </button>
        ) : (
          <Link
            to="/admin/chat"
            className="chat-wa-icon-btn md:!hidden"
            aria-label="Sohbet listesine dön"
          >
            <ChevronLeft size={compact ? 20 : 24} />
          </Link>
        )}
        <span className="chat-wa-avatar chat-wa-room__header-avatar">
          {chatInitials(headerTitle)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="chat-wa-room__title">{headerTitle}</h1>
          {isDm ? (
            <div className="chat-wa-room__subtitle">{formatChatPresence(peerPresence)}</div>
          ) : null}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={CHAT_FILE_INPUT_ACCEPT}
        style={{ display: 'none' }}
        onChange={(e) => {
          onAttachmentSelected(e.target.files?.[0])
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
          onAttachmentSelected(e.target.files?.[0])
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
          onAttachmentSelected(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <div
        ref={scrollerRef}
        className={`chat-wa-room__scroll${scrollAnchored ? ' is-anchored' : ''}`}
        onScroll={onScrollerScroll}
      >
        {hasOlder ? (
          <button
                type="button"
                className="chat-wa-load-older"
                onClick={() => void loadOlder()}
                disabled={loadingOlder}
              >
                {loadingOlder ? 'Yükleniyor…' : 'Daha eski mesajlar'}
              </button>
            ) : null}
            {messages.map((item) => {
              const mine = normalizeChatUuid(item.gonderen_kullanici_id) === uidNorm
              const senderId = normalizeChatUuid(item.gonderen_kullanici_id)
              const senderName =
                senderNameByUserId[senderId] ||
                (!mine && isDm && senderId === dmPeerId ? headerTitle : null)
              const senderLabel = mine ? 'Siz' : senderName
              const time =
                item.olusturulma_at &&
                new Date(item.olusturulma_at).toLocaleTimeString('tr-TR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              const bs = mine ? bubbleStyles.mine : bubbleStyles.theirs
              const hasMedia = item.mesaj_tipi && item.mesaj_tipi !== 'text' && item.ek_yol
              const receipt = readReceiptUi(item.id, mine, isDm, peerMaxReadId)
              const showCaption = shouldShowMessageCaption(item, hasMedia)

              return (
                <div
                  key={item.id}
                  className={`chat-wa-bubble${mine ? ' chat-wa-bubble--mine' : ' chat-wa-bubble--theirs'}${hasMedia ? ' chat-wa-bubble--has-media' : ''}`}
                  style={{
                    ...bs,
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
                  {senderLabel ? (
                    <div
                      style={{
                        marginBottom: 6,
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: 0.1,
                        color: mine ? 'rgba(255,255,255,0.88)' : '#334155',
                      }}
                    >
                      {senderLabel}
                    </div>
                  ) : (
                    <span className="chat-wa-sender-skeleton" aria-hidden />
                  )}
                  {hasMedia ? <ChatAttachmentBody row={item} mine={mine} /> : null}
                  {showCaption ? (
                    <div
                      className="chat-wa-bubble__text"
                      style={{
                        marginTop: hasMedia ? (compact ? 6 : 8) : 0,
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
                          color: receipt.read
                            ? chatWa.tickRead
                            : mine
                              ? 'rgba(255,255,255,0.65)'
                              : chatWa.textMuted,
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
        <div ref={bottomRef} />
      </div>

      <div className="chat-wa-room__composer-wrap">
        <ChatEmojiPicker
          open={emojiOpen}
          anchorRef={emojiBtnRef}
          onPick={onEmojiPick}
          onClose={() => setEmojiOpen(false)}
        />
        <div className="chat-wa-room__composer">
          <button
            type="button"
            disabled={sending}
          onClick={() => fileInputRef.current?.click()}
          title="Dosya, fotoğraf veya video seç"
            className="chat-wa-icon-btn"
          >
            <Paperclip size={22} />
          </button>
          <textarea
            ref={draftInputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Bir mesaj yazın"
            rows={1}
            maxLength={8000}
            disabled={sending}
            className="chat-wa-room__input"
          />
          <button
            ref={emojiBtnRef}
            type="button"
            className={`chat-wa-icon-btn${emojiOpen ? ' is-active' : ''}`}
            disabled={sending}
            aria-label="Emoji"
            aria-expanded={emojiOpen}
            onClick={toggleEmojiPicker}
          >
            <Smile size={22} />
          </button>
        <button
          type="button"
          className="chat-wa-icon-btn chat-wa-icon-btn--send"
          onClick={() => void onSend()}
          disabled={!canSend}
          aria-label="Gönder"
        >
          <Send size={22} />
        </button>
        {pendingFile ? (
          <div className="chat-wa-room__pending-file">
            Seçili: {pendingFile.name}{' '}
            <button type="button" onClick={() => setPendingFile(null)}>
              Kaldır
            </button>
          </div>
        ) : null}
        </div>
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
