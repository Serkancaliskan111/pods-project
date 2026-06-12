import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Modal,
  Pressable,
  StatusBar,
  Keyboard,
  Animated,
} from 'react-native'
import ImageViewing from 'react-native-image-viewing'
import EvidenceVideoPlayer from '../components/EvidenceVideoPlayer'
import { useRoute, useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import * as Location from 'expo-location'
import { ChevronDown, ChevronLeft, Camera, Forward, Mic, Plus, Send, Smile, Users, Video } from 'lucide-react-native'
import ChatEmojiPicker from '../components/ChatEmojiPicker'
import {
  CHAT_DOCUMENT_PICKER_TYPES,
  chatUnsupportedFileMessage,
  formatChatUploadUserMessage,
  isChatAttachmentAllowed,
} from '../lib/chatAttachmentTypes'
import ChatFileAttachmentBubble from '../components/chat/ChatFileAttachmentBubble'
import ChatRoomWallpaper from '../components/chat/ChatRoomWallpaper'
import ChatAttachmentSheet from '../components/chat/ChatAttachmentSheet'
import ChatLocationBubble from '../components/chat/ChatLocationBubble'
import ChatVoiceBubble from '../components/chat/ChatVoiceBubble'
import ChatVoiceRecordingBar from '../components/chat/ChatVoiceRecordingBar'
import ChatMessageActionOverlay from '../components/chat/ChatMessageActionOverlay'
import ChatForwardModal from '../components/chat/ChatForwardModal'
import ChatSwipeToReply from '../components/chat/ChatSwipeToReply'
import ChatReplyBar from '../components/chat/ChatReplyBar'
import ChatReplyQuoteBlock from '../components/chat/ChatReplyQuoteBlock'
import ChatForwardedLabel from '../components/chat/ChatForwardedLabel'
import ChatMediaSendPreview from '../components/chat/ChatMediaSendPreview'
import ChatProfileAvatar from '../components/chat/ChatProfileAvatar'
import { buildMessagePreview } from '../lib/chatMessagePreview'
import { parseChatMessageContent, formatReplyMessageBody } from '../lib/chatMessageContentParse'
import { quoteColorForSender } from '../lib/chatQuoteColors'
import { toggleChatMessageStar, toggleChatMessagePin } from '../lib/chatMessageLocalActions'
import ChatPollBubble from '../components/chat/ChatPollBubble'
import ChatPollCreateModal from '../components/chat/ChatPollCreateModal'
import { useChatVoiceRecord } from '../hooks/useChatVoiceRecord'
import { useAuth } from '../contexts/AuthContext'
import { useUiTheme } from '../contexts/UiThemeContext'
import { buildChatRoomTheme } from '../lib/buildChatRoomTheme'
import Theme from '../theme/theme'
import { palette as kitPalette, spacing as kitSpacing } from '../ui/tokens'
import { Icon, Avatar as KitAvatar } from '../ui'
import { senderColorForId } from '../theme/whatsappChat'
import {
  fetchMessages,
  sendMessage,
  markRead,
  subscribeRoomInserts,
  fetchKanal,
  resolveChannelTitles,
  fetchChannelMembers,
  normalizeChatUuid,
  sortMessagesByIdAsc,
  CHAT_MESSAGES_PAGE_SIZE,
  CHAT_RESYNC_DEBOUNCE_MS,
  CHAT_OLDER_MESSAGES_BATCH,
  uploadChatBlob,
  inferMesajTipiFromMime,
  sendLocationMessage,
  sendPollMessage,
  voteChatPoll,
  fetchPollDetailsByMessageIds,
  forwardChatMessage,
  fetchChannelMemberReadStates,
  fetchPeersPresenceMap,
  computeMessageReadReceipt,
  subscribeMembershipReadStates,
  subscribePeerPresenceRow,
  createChatAttachmentSignedUrl,
  isChatPresenceFresh,
} from '../lib/chatApi'

const ThemeObj = Theme?.default ?? Theme
const { Colors, Typography } = ThemeObj

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

/**
 * DM/grup mesaj tik durumu. Inline ikon olarak render edilir; her dönen değer
 * `state` ile ifade edilir: `sent` (tek tik), `delivered` (cift tik gri),
 * `read` (cift tik mavi/aktif).
 */
function readReceiptLabel(msgId, mine, memberRows, myUserId) {
  if (!mine) return null
  return computeMessageReadReceipt(msgId, memberRows, myUserId)
}

function ChatAttachmentMobile({ row, mine, styles }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  const [imageViewerVisible, setImageViewerVisible] = useState(false)
  const [videoModalVisible, setVideoModalVisible] = useState(false)
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

  if (failed) {
    return (
      <Text style={[styles.attFail, mine && styles.attFailMine]}>
        Ek açılamadı{row?.ek_orijinal_ad ? ` (${row.ek_orijinal_ad})` : ''}
      </Text>
    )
  }

  if (tip === 'image' && url) {
    return (
      <>
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => setImageViewerVisible(true)}
          accessibilityRole="imagebutton"
          accessibilityLabel="Fotoğrafı büyüt"
        >
          <Image source={{ uri: url }} style={styles.attImg} resizeMode="cover" />
        </TouchableOpacity>
        <ImageViewing
          images={[{ uri: url }]}
          imageIndex={0}
          visible={imageViewerVisible}
          onRequestClose={() => setImageViewerVisible(false)}
          presentationStyle="overFullScreen"
        />
      </>
    )
  }

  if (tip === 'video' && url) {
    return (
      <>
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => setVideoModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Videoyu tam ekran aç"
          style={styles.videoThumbOuter}
        >
          <View style={styles.videoThumbInner} pointerEvents="none">
            <EvidenceVideoPlayer
              uri={url}
              nativeControls={false}
              contentFit="cover"
              style={styles.videoThumbPlayer}
            />
            <View style={styles.videoThumbOverlay}>
              <Icon.Video size={16} color={kitPalette.surface} strokeWidth={2} />
              <Text style={styles.videoThumbOverlayText}>Oynat</Text>
            </View>
          </View>
        </TouchableOpacity>
        <Modal
          visible={videoModalVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setVideoModalVisible(false)}
        >
          <View style={styles.videoModalRoot}>
            <Pressable style={styles.videoModalBackdrop} onPress={() => setVideoModalVisible(false)} />
            <View style={styles.videoModalSheet}>
              <EvidenceVideoPlayer
                uri={url}
                nativeControls
                contentFit="contain"
                style={styles.videoModalPlayer}
              />
              <TouchableOpacity style={styles.videoModalClose} onPress={() => setVideoModalVisible(false)}>
                <Text style={styles.videoModalCloseText}>Kapat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </>
    )
  }

  if (tip === 'file' && url) {
    return <ChatFileAttachmentBubble row={row} mine={mine} styles={styles} url={url} />
  }

  return <Text style={[styles.attPending, mine && styles.attPendingMine]}>Ek hazırlanıyor…</Text>
}

export default function ChatRoom() {
  const { theme: uiTheme } = useUiTheme()
  const chatTheme = useMemo(() => buildChatRoomTheme(uiTheme), [uiTheme])
  const styles = useMemo(() => buildChatStyles(chatTheme), [chatTheme])

  const route = useRoute()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { user, personel, profile } = useAuth()
  const uid = user?.id
  const uidNorm = normalizeChatUuid(uid)
  const companyId = personel?.ana_sirket_id
  const channelId = normalizeChatUuid(route.params?.channelId)
  const initialTitle = route.params?.title || 'Sohbet'

  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const [headerTitle, setHeaderTitle] = useState(initialTitle)
  const [kanalMeta, setKanalMeta] = useState(null)
  const [groupCreatorLabel, setGroupCreatorLabel] = useState('')
  const [groupMemberNames, setGroupMemberNames] = useState([])
  const [groupInfoVisible, setGroupInfoVisible] = useState(false)
  const [memberReads, setMemberReads] = useState([])
  const [peerPresence, setPeerPresence] = useState(null)
  const [senderNameByUserId, setSenderNameByUserId] = useState({})
  const [senderPhotoByUserId, setSenderPhotoByUserId] = useState({})
  const [selectedMessage, setSelectedMessage] = useState(null)
  const [pendingAttachment, setPendingAttachment] = useState(null)
  const [mediaPreview, setMediaPreview] = useState(null)
  const [mediaPreviewCaption, setMediaPreviewCaption] = useState('')
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [attachSheetOpen, setAttachSheetOpen] = useState(false)
  const [pollModalOpen, setPollModalOpen] = useState(false)
  const [pollDetails, setPollDetails] = useState({})
  const [votingPollId, setVotingPollId] = useState(null)
  const [pollSubmitting, setPollSubmitting] = useState(false)
  const [actionAnchor, setActionAnchor] = useState(null)
  const [forwardSource, setForwardSource] = useState(null)
  const [forwarding, setForwarding] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [reactionsById, setReactionsById] = useState({})
  const bubbleRefs = useRef({})
  const {
    isRecording,
    isPaused,
    durationMs,
    meterSamples,
    start: startVoiceRecord,
    stop: stopVoiceRecord,
    cancel: cancelVoiceRecord,
    togglePause: toggleVoicePause,
  } = useChatVoiceRecord()
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlder, setHasOlder] = useState(true)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const resyncTimerRef = useRef(null)
  const firstMsgIdRef = useRef(null)
  const plusRotate = useRef(new Animated.Value(0)).current

  const isDm = kanalMeta?.tur === 'birebir'

  const dmPeerId = useMemo(() => {
    if (!kanalMeta || kanalMeta.tur !== 'birebir' || !uidNorm) return null
    const low = normalizeChatUuid(kanalMeta.dm_user_low)
    const other = low === uidNorm ? kanalMeta.dm_user_high : kanalMeta.dm_user_low
    return normalizeChatUuid(other)
  }, [kanalMeta, uidNorm])

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: false })
    })
  }, [])

  const applyKanalHeader = useCallback(
    async (k) => {
      if (!k || !uid) return
      setKanalMeta(k)
      try {
        const [withTitle] = await resolveChannelTitles([{ ...k, _membership: {} }], uid, companyId)
        if (withTitle?.displayTitle) setHeaderTitle(withTitle.displayTitle)
        if (withTitle?.tur === 'grup') {
          setGroupCreatorLabel(withTitle.groupCreatorName || '')
          try {
            const members = await fetchChannelMembers(withTitle.id, companyId)
            setGroupMemberNames(
              (members || [])
                .map((m) => String(m.ad_soyad || '').trim())
                .filter(Boolean)
                .slice(0, 40),
            )
          } catch {
            setGroupMemberNames([])
          }
        } else {
          setGroupCreatorLabel('')
          setGroupMemberNames([])
        }
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
        /* kanal meta yüklenemezse mesajları gizleme */
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
      if (__DEV__) console.warn('[ChatRoom]', e?.message || e)
      setMessages([])
    } finally {
      setLoading(false)
      scrollToEnd()
    }
  }, [channelId, uid, scrollToEnd, applyKanalHeader])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  useEffect(() => {
    if (!channelId) {
      setSenderNameByUserId({})
      setSenderPhotoByUserId({})
      return
    }
    let cancelled = false
    void fetchChannelMembers(channelId, companyId)
      .then((members) => {
        if (cancelled) return
        const nameMap = {}
        const photoMap = {}
        for (const m of members || []) {
          const k = normalizeChatUuid(m?.kullanici_id)
          if (!k) continue
          nameMap[k] = String(m?.ad_soyad || '').trim() || `Kullanıcı ${k.slice(0, 8)}`
          if (m?.profil_foto_yol) photoMap[k] = m.profil_foto_yol
        }
        setSenderNameByUserId(nameMap)
        setSenderPhotoByUserId(photoMap)
      })
      .catch(() => {
        if (!cancelled) {
          setSenderNameByUserId({})
          setSenderPhotoByUserId({})
        }
      })
    return () => {
      cancelled = true
    }
  }, [channelId, companyId])

  useEffect(() => {
    setHasOlder(true)
    setPendingAttachment(null)
    setMediaPreview(null)
    setMediaPreviewCaption('')
    setGroupCreatorLabel('')
    setGroupMemberNames([])
    setGroupInfoVisible(false)
    setAttachSheetOpen(false)
  }, [channelId])

  useEffect(() => {
    Animated.spring(plusRotate, {
      toValue: attachSheetOpen ? 1 : 0,
      useNativeDriver: true,
      friction: 7,
      tension: 80,
    }).start()
  }, [attachSheetOpen, plusRotate])

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvent, () => {
      setAttachSheetOpen(false)
      setKeyboardVisible(true)
      scrollToEnd()
    })
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false))
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [scrollToEnd])

  useEffect(() => {
    if (!attachSheetOpen) return
    scrollToEnd()
  }, [attachSheetOpen, scrollToEnd])

  useEffect(() => {
    const pollIds = messages.filter((m) => m.mesaj_tipi === 'poll').map((m) => m.id)
    if (!pollIds.length) {
      setPollDetails({})
      return
    }
    let cancelled = false
    void fetchPollDetailsByMessageIds(pollIds, uid)
      .then((map) => {
        if (!cancelled) setPollDetails(map)
      })
      .catch(() => {
        if (!cancelled) setPollDetails({})
      })
    return () => {
      cancelled = true
    }
  }, [messages, uid])

  useEffect(() => {
    firstMsgIdRef.current = messages[0]?.id ?? null
  }, [messages])

  useEffect(() => {
    if (!channelId) return undefined
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      if (resyncTimerRef.current) clearTimeout(resyncTimerRef.current)
      resyncTimerRef.current = setTimeout(() => {
        void fetchKanal(channelId)
          .then((k) => k && applyKanalHeader(k))
          .catch(() => {})
        void fetchMessages(channelId, { limit: CHAT_MESSAGES_PAGE_SIZE })
          .then((rows) => setMessages(sortMessagesByIdAsc(rows)))
          .catch(() => {})
      }, CHAT_RESYNC_DEBOUNCE_MS)
    })
    return () => {
      sub.remove()
      if (resyncTimerRef.current) clearTimeout(resyncTimerRef.current)
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
      scrollToEnd()
    })
    return unsub
  }, [channelId, uidNorm, scrollToEnd])

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

  const pickGallery = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('İzin gerekli', 'Galeri erişimi için izin verin.')
        return
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.85,
      })
      if (res.canceled || !res.assets?.length) return
      const a = res.assets[0]
      const mime = a.mimeType || (a.type === 'video' ? 'video/mp4' : 'image/jpeg')
      setMediaPreviewCaption('')
      setMediaPreview({
        uri: a.uri,
        mimeType: mime,
        fileName: a.fileName || `media_${Date.now()}`,
        fileSize: a.fileSize,
        isVideo: a.type === 'video' || String(mime).startsWith('video/'),
      })
      setAttachSheetOpen(false)
    } catch (e) {
      Alert.alert('Hata', e?.message || String(e))
    }
  }, [])

  const pickDocument = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: CHAT_DOCUMENT_PICKER_TYPES,
      })
      if (res.canceled) return
      const a = res.assets?.[0]
      if (!a?.uri) return
      if (!isChatAttachmentAllowed({ mime: a.mimeType, fileName: a.name })) {
        Alert.alert('Desteklenmeyen dosya', chatUnsupportedFileMessage())
        return
      }
      setPendingAttachment({
        uri: a.uri,
        mimeType: a.mimeType || 'application/octet-stream',
        fileName: a.name || 'dosya',
        fileSize: a.size,
      })
    } catch (e) {
      Alert.alert('Desteklenmeyen dosya', chatUnsupportedFileMessage())
    }
  }, [])

  const takePhotoCamera = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('İzin gerekli', 'Fotoğraf çekmek için kameraya izin verin.')
        return
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: false,
      })
      if (res.canceled || !res.assets?.[0]) return
      const a = res.assets[0]
      setMediaPreviewCaption('')
      setMediaPreview({
        uri: a.uri,
        mimeType: a.mimeType || 'image/jpeg',
        fileName: a.fileName || `kamera_foto_${Date.now()}.jpg`,
        fileSize: a.fileSize,
        isVideo: false,
      })
    } catch (e) {
      Alert.alert('Hata', e?.message || String(e))
    }
  }, [])

  const takeVideoCamera = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('İzin gerekli', 'Video çekmek için kameraya izin verin.')
        return
      }
      const opts = {
        mediaTypes: ['videos'],
        videoMaxDuration: 180,
        allowsEditing: false,
      }
      if (Platform.OS === 'ios') {
        opts.videoExportPreset = ImagePicker.VideoExportPreset.MediumQuality
      }
      const res = await ImagePicker.launchCameraAsync(opts)
      if (res.canceled || !res.assets?.[0]) return
      const a = res.assets[0]
      setPendingAttachment({
        uri: a.uri,
        mimeType: a.mimeType || (Platform.OS === 'ios' ? 'video/quicktime' : 'video/mp4'),
        fileName: a.fileName || `kamera_video_${Date.now()}.mp4`,
        fileSize: a.fileSize,
      })
    } catch (e) {
      Alert.alert('Hata', e?.message || String(e))
    }
  }, [])

  const refreshMessagesAfterSend = useCallback(
    async (mid) => {
      await new Promise((r) => setTimeout(r, 120))
      let rows = await fetchMessages(channelId, { limit: CHAT_MESSAGES_PAGE_SIZE })
      if (mid != null && mid !== '') {
        const verified = rows.some((r) => String(r.id) === String(mid))
        if (!verified) {
          await new Promise((r) => setTimeout(r, 280))
          rows = await fetchMessages(channelId, { limit: CHAT_MESSAGES_PAGE_SIZE })
        }
      }
      setMessages(sortMessagesByIdAsc(rows))
      setHasOlder(rows.length >= CHAT_MESSAGES_PAGE_SIZE)
      const last = rows[rows.length - 1]
      if (last?.id != null) {
        try {
          await markRead(channelId, last.id)
        } catch {
          /* ignore */
        }
      }
      scrollToEnd()
    },
    [channelId, scrollToEnd],
  )

  const shareCurrentLocation = useCallback(async () => {
    if (!channelId || sending) return
    try {
      const perm = await Location.requestForegroundPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('İzin gerekli', 'Konum göndermek için konum izni verin.')
        return
      }
      setSending(true)
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const { latitude, longitude } = pos.coords
      let label = ''
      try {
        const rev = await Location.reverseGeocodeAsync({ latitude, longitude })
        const p = rev?.[0]
        if (p) {
          label = [p.name, p.street, p.district, p.city].filter(Boolean).join(', ')
        }
      } catch {
        /* ignore */
      }
      const mid = await sendLocationMessage(channelId, {
        lat: latitude,
        lng: longitude,
        label,
      })
      await refreshMessagesAfterSend(mid)
    } catch (e) {
      Alert.alert('Konum gönderilemedi', e?.message || String(e))
    } finally {
      setSending(false)
    }
  }, [channelId, sending, refreshMessagesAfterSend])

  const handleAttachmentPick = useCallback(
    (key) => {
      setAttachSheetOpen(false)
      if (key === 'gallery') void pickGallery()
      else if (key === 'camera') void takePhotoCamera()
      else if (key === 'document') void pickDocument()
      else if (key === 'location') void shareCurrentLocation()
      else if (key === 'poll') setPollModalOpen(true)
    },
    [pickGallery, takePhotoCamera, pickDocument, shareCurrentLocation],
  )

  const submitPoll = useCallback(
    async ({ question, options, allowMultiple }) => {
      if (!channelId || pollSubmitting) return
      setPollSubmitting(true)
      try {
        const mid = await sendPollMessage(channelId, { question, options, allowMultiple })
        setPollModalOpen(false)
        await refreshMessagesAfterSend(mid)
      } catch (e) {
        const raw = String(e?.message || e || '')
        const cause = e?.cause
        const errorKind = e?.chatAnketErrorKind || null
        console.error('[ChatRoom] submitPoll failed', {
          channelId,
          questionLength: String(question || '').trim().length,
          optionCount: (options || []).filter(Boolean).length,
          allowMultiple: !!allowMultiple,
          message: raw,
          errorKind,
          code: e?.code ?? cause?.code ?? null,
          details: e?.details ?? cause?.details ?? null,
          hint: e?.hint ?? cause?.hint ?? null,
          status: e?.status ?? cause?.status ?? null,
          causeMessage: cause?.message ?? null,
        })
        const friendly =
          raw.includes('row-level security') ||
          raw.includes('sohbet_anketleri') ||
          errorKind?.startsWith('rls_')
            ? 'Anket sunucu yapılandırması eksik. Lütfen yöneticinize bildirin.'
            : raw || 'Anket gönderilemedi.'
        const devDetail =
          __DEV__ && (errorKind || cause?.message)
            ? `\n\n[dev] ${errorKind || 'unknown'}: ${cause?.message || raw}`
            : ''
        Alert.alert('Anket gönderilemedi', `${friendly}${devDetail}`)
      } finally {
        setPollSubmitting(false)
      }
    },
    [channelId, pollSubmitting, refreshMessagesAfterSend],
  )

  const handlePollVote = useCallback(
    async (mesajId, secenekId) => {
      if (votingPollId) return
      setVotingPollId(mesajId)
      try {
        await voteChatPoll(mesajId, secenekId)
        const map = await fetchPollDetailsByMessageIds([mesajId], uid)
        setPollDetails((prev) => ({ ...prev, ...map }))
      } catch (e) {
        console.error('[ChatRoom] handlePollVote failed', {
          mesajId,
          secenekId,
          message: e?.message ?? String(e),
          code: e?.code ?? null,
          details: e?.details ?? null,
        })
        Alert.alert('Oy kaydedilemedi', e?.message || String(e))
      } finally {
        setVotingPollId(null)
      }
    },
    [votingPollId, uid],
  )

  const sendVoiceMessage = useCallback(async () => {
    if (!channelId || sending) return
    const clip = await stopVoiceRecord()
    if (!clip?.uri) return
    setSending(true)
    try {
      const uploaded = await uploadChatBlob(channelId, clip, {
        contentType: clip.mimeType,
        fileName: clip.fileName,
      })
      const mid = await sendMessage(channelId, '', {
        mesaj_tipi: 'voice',
        ek_yol: uploaded.ek_yol,
        ek_orijinal_ad: uploaded.ek_orijinal_ad,
        ek_mime: uploaded.ek_mime,
        ek_boyut: uploaded.ek_boyut,
        ses_suresi_sn: clip.durationSec,
      })
      await refreshMessagesAfterSend(mid)
    } catch (e) {
      Alert.alert('Sesli mesaj gönderilemedi', e?.message || String(e))
    } finally {
      setSending(false)
    }
  }, [channelId, sending, stopVoiceRecord, refreshMessagesAfterSend])

  const toggleAttachSheet = useCallback(() => {
    if (attachSheetOpen) {
      setAttachSheetOpen(false)
      setTimeout(() => inputRef.current?.focus(), 80)
      return
    }
    Keyboard.dismiss()
    setEmojiPickerOpen(false)
    setTimeout(() => setAttachSheetOpen(true), Platform.OS === 'ios' ? 60 : 30)
  }, [attachSheetOpen])

  const openEmojiPicker = useCallback(() => {
    if (emojiPickerOpen) {
      setEmojiPickerOpen(false)
      setTimeout(() => inputRef.current?.focus(), 40)
      return
    }
    setAttachSheetOpen(false)
    Keyboard.dismiss()
    setTimeout(() => setEmojiPickerOpen(true), 40)
  }, [emojiPickerOpen])

  const loadOlder = useCallback(async () => {
    const firstId = firstMsgIdRef.current
    if (loadingOlder || !hasOlder || !channelId || firstId == null) return
    setLoadingOlder(true)
    try {
      const older = await fetchMessages(channelId, {
        beforeId: firstId,
        limit: CHAT_OLDER_MESSAGES_BATCH,
      })
      if (older.length < CHAT_OLDER_MESSAGES_BATCH) setHasOlder(false)
      if (older.length) {
        setMessages((prev) => sortMessagesByIdAsc([...older, ...prev]))
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingOlder(false)
    }
  }, [channelId, loadingOlder, hasOlder])

  const sendAttachmentMessage = useCallback(
    async (att, captionText, replyBk) => {
      if (!att || !channelId || sending) return
      setSending(true)
      try {
        let body = String(captionText || '').trim()
        if (replyBk) {
          const replySender =
            senderNameByUserId[normalizeChatUuid(replyBk.gonderen_kullanici_id)] || 'Kullanıcı'
          const quote = buildMessagePreview(replyBk)
          body = formatReplyMessageBody({ sender: replySender, preview: quote, body })
        }
        const uploaded = await uploadChatBlob(channelId, att, {
          contentType: att.mimeType,
          fileName: att.fileName,
        })
        const tip = inferMesajTipiFromMime(uploaded.ek_mime || att.mimeType)
        const mid = await sendMessage(channelId, body, {
          mesaj_tipi: tip,
          ek_yol: uploaded.ek_yol,
          ek_orijinal_ad: uploaded.ek_orijinal_ad,
          ek_mime: uploaded.ek_mime,
          ek_boyut: uploaded.ek_boyut ?? att.fileSize ?? null,
        })
        await refreshMessagesAfterSend(mid)
        return true
      } catch (e) {
        const msg = formatChatUploadUserMessage(e)
        if (__DEV__) console.warn('[ChatRoom send attachment]', e?.message || e)
        Alert.alert('Desteklenmeyen dosya', msg)
        return false
      } finally {
        setSending(false)
      }
    },
    [channelId, sending, refreshMessagesAfterSend, senderNameByUserId],
  )

  const onSend = useCallback(async () => {
    const t = draft.trim()
    const att = pendingAttachment
    if ((!t && !att) || !channelId || sending) return
    const draftBk = draft
    const attBk = pendingAttachment
    const replyBk = replyTo
    setDraft('')
    setPendingAttachment(null)
    setReplyTo(null)
    if (att) {
      const ok = await sendAttachmentMessage(att, t, replyBk)
      if (!ok) {
        setDraft(draftBk)
        setPendingAttachment(attBk)
        setReplyTo(replyBk)
      }
      return
    }
    setSending(true)
    try {
      let body = t
      if (replyBk) {
        const replySender =
          senderNameByUserId[normalizeChatUuid(replyBk.gonderen_kullanici_id)] || 'Kullanıcı'
        const quote = buildMessagePreview(replyBk)
        body = formatReplyMessageBody({ sender: replySender, preview: quote, body: t })
      }
      const mid = await sendMessage(channelId, body)
      await refreshMessagesAfterSend(mid)
    } catch (e) {
      const msg = e?.message || String(e)
      if (__DEV__) console.warn('[ChatRoom send]', msg)
      Alert.alert('Mesaj gönderilemedi', msg)
      setDraft(draftBk)
      setReplyTo(replyBk)
    } finally {
      setSending(false)
    }
  }, [draft, pendingAttachment, replyTo, channelId, sending, refreshMessagesAfterSend, senderNameByUserId, sendAttachmentMessage])

  const handleMediaPreviewSend = useCallback(async () => {
    if (!mediaPreview || sending) return
    const replyBk = replyTo
    const att = {
      uri: mediaPreview.uri,
      mimeType: mediaPreview.mimeType,
      fileName: mediaPreview.fileName,
      fileSize: mediaPreview.fileSize,
    }
    const ok = await sendAttachmentMessage(att, mediaPreviewCaption, replyBk)
    if (ok) {
      setMediaPreview(null)
      setMediaPreviewCaption('')
      setReplyTo(null)
    }
  }, [mediaPreview, mediaPreviewCaption, replyTo, sending, sendAttachmentMessage])

  const canSend = (!!draft.trim() || !!pendingAttachment) && !sending && !isRecording

  const onMicPress = useCallback(async () => {
    if (canSend || sending || isRecording) return
    setAttachSheetOpen(false)
    Keyboard.dismiss()
    try {
      await startVoiceRecord()
    } catch (e) {
      Alert.alert('Ses kaydı', e?.message || String(e))
    }
  }, [canSend, sending, isRecording, startVoiceRecord])

  const onRecordingSend = useCallback(async () => {
    if (!isRecording || sending) return
    await sendVoiceMessage()
  }, [isRecording, sending, sendVoiceMessage])

  const handleSwipeReply = useCallback(
    (msg) => {
      setReplyTo(msg)
      setAttachSheetOpen(false)
      setEmojiPickerOpen(false)
      if (!keyboardVisible) {
        setTimeout(() => inputRef.current?.focus(), 40)
      }
      scrollToEnd()
    },
    [scrollToEnd, keyboardVisible],
  )

  const openMessageActions = useCallback((item, mine, senderLabel) => {
    const ref = bubbleRefs.current[String(item.id)]
    if (!ref?.measureInWindow) {
      setActionAnchor({ message: item, mine, senderLabel })
      return
    }
    ref.measureInWindow((x, y, width, height) => {
      setActionAnchor({ message: item, mine, senderLabel, x, y, width, height })
    })
  }, [])

  const closeMessageActions = useCallback(() => setActionAnchor(null), [])

  const handleMessageAction = useCallback(
    async (action, payload) => {
      const msg = actionAnchor?.message
      if (!msg) return
      if (action === 'react') {
        setReactionsById((prev) => ({ ...prev, [String(msg.id)]: payload }))
        closeMessageActions()
        return
      }
      if (action === 'react-more') {
        closeMessageActions()
        Alert.alert('Tepkiler', 'Daha fazla emoji seçeneği yakında eklenecek.')
        return
      }
      closeMessageActions()
      if (action === 'reply') {
        setReplyTo(msg)
        setTimeout(() => inputRef.current?.focus(), 80)
        return
      }
      if (action === 'forward') {
        setForwardSource(msg)
        return
      }
      if (action === 'info') {
        setSelectedMessage(msg)
        return
      }
      if (action === 'star') {
        const on = await toggleChatMessageStar(msg.id)
        Alert.alert(on ? 'Yıldız eklendi' : 'Yıldız kaldırıldı')
        return
      }
      if (action === 'pin') {
        const on = await toggleChatMessagePin(channelId, msg.id)
        Alert.alert(on ? 'Mesaj sabitlendi (cihazınızda)' : 'Sabitleme kaldırıldı')
      }
    },
    [actionAnchor, channelId, closeMessageActions],
  )

  const handleForwardToChannel = useCallback(
    async (channelRow) => {
      if (!forwardSource || forwarding) return
      setForwarding(true)
      try {
        await forwardChatMessage(channelRow.id, forwardSource)
        setForwardSource(null)
        Alert.alert('İletildi', `${channelRow.displayTitle} sohbetine gönderildi.`)
      } catch (e) {
        Alert.alert('İletilemedi', e?.message || String(e))
      } finally {
        setForwarding(false)
      }
    },
    [forwardSource, forwarding],
  )

  const renderMsg = useCallback(
    ({ item, index }) => {
      const mine = normalizeChatUuid(item.gonderen_kullanici_id) === uidNorm
      const senderId = normalizeChatUuid(item.gonderen_kullanici_id)
      const prev = index > 0 ? messages[index - 1] : null
      const prevSender = prev ? normalizeChatUuid(prev.gonderen_kullanici_id) : null
      const showAvatar = !mine && senderId !== prevSender
      const senderLabel =
        senderNameByUserId[senderId] || (senderId ? `Kullanıcı ${senderId.slice(0, 8)}` : 'Kullanıcı')
      const time =
        item.olusturulma_at &&
        new Date(item.olusturulma_at).toLocaleTimeString('tr-TR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      const tip = item.mesaj_tipi || 'text'
      const parsed = parseChatMessageContent(item.icerik)
      const displayBody = parsed.body
      const showForwarded = parsed.forwarded
      const showReplyQuote = !!parsed.reply
      const myName = senderNameByUserId[uidNorm] || ''
      const quoteAccent = parsed.reply
        ? quoteColorForSender(parsed.reply.sender, myName, chatTheme)
        : chatTheme.accent
      const hasFileMedia = ['image', 'video', 'file'].includes(tip) && item.ek_yol
      const showMediaForward = (tip === 'image' || tip === 'video') && !!item.ek_yol
      const showCap = Boolean(displayBody) && tip !== 'poll' && tip !== 'location' && tip !== 'voice'
      const hasVisibleContent =
        showCap ||
        showReplyQuote ||
        showForwarded ||
        tip === 'location' ||
        tip === 'poll' ||
        tip === 'voice' ||
        hasFileMedia
      const receipt = readReceiptLabel(item.id, mine, memberReads, uid)
      const showSender = !isDm && !mine && showAvatar
      const reaction = reactionsById[String(item.id)]

      return (
        <View
          style={[
            styles.bubbleWrap,
            mine ? styles.bubbleWrapMine : styles.bubbleWrapTheirs,
            reaction && styles.bubbleWrapWithReaction,
          ]}
        >
          {!mine ? (
            <View style={styles.avatarSlot}>
              {showAvatar ? (
                <ChatProfileAvatar
                  name={senderLabel}
                  photoPath={senderPhotoByUserId[senderId]}
                  size="xs"
                />
              ) : null}
            </View>
          ) : null}
          {showMediaForward ? (
            <TouchableOpacity
              style={styles.msgForwardBtn}
              onPress={() => setForwardSource(item)}
              hitSlop={8}
              accessibilityLabel="Mesajı ilet"
            >
              <Forward size={20} color={chatTheme.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          ) : null}
          <ChatSwipeToReply mine={mine} onReply={() => handleSwipeReply(item)} theme={chatTheme}>
          <Pressable
            ref={(r) => {
              bubbleRefs.current[String(item.id)] = r
            }}
            delayLongPress={320}
            onLongPress={() => openMessageActions(item, mine, senderLabel)}
            style={({ pressed }) => [
              styles.bubble,
              mine ? styles.bubbleMine : styles.bubbleTheirs,
              tip === 'voice' && (mine ? styles.bubbleVoiceMine : styles.bubbleVoiceTheirs),
              pressed && styles.bubblePressed,
            ]}
          >
            {showSender ? (
              <Text style={[styles.msgSenderGroup, { color: senderColorForId(senderId) }]} numberOfLines={1}>
                {senderLabel}
              </Text>
            ) : null}
            {showForwarded ? <ChatForwardedLabel theme={chatTheme} /> : null}
            {showReplyQuote ? (
              <ChatReplyQuoteBlock
                theme={chatTheme}
                sender={parsed.reply.sender}
                preview={parsed.reply.preview}
                accentColor={quoteAccent}
                mine={mine}
              />
            ) : null}
            {tip === 'location' ? (
              <ChatLocationBubble row={item} styles={styles} theme={chatTheme} />
            ) : null}
            {tip === 'poll' ? (
              <ChatPollBubble
                poll={pollDetails[String(item.id)]}
                theme={chatTheme}
                voting={votingPollId === item.id}
                onVote={(secenekId) => void handlePollVote(item.id, secenekId)}
              />
            ) : null}
            {tip === 'voice' ? (
              <ChatVoiceBubble
                row={item}
                mine={mine}
                senderLabel={senderLabel}
                senderPhotoPath={senderPhotoByUserId[senderId]}
                styles={styles}
                theme={chatTheme}
                timeLabel={time}
                receipt={receipt}
              />
            ) : null}
            {hasFileMedia ? <ChatAttachmentMobile row={item} mine={mine} styles={styles} /> : null}
            {showCap ? (
              <Text style={[styles.msgText, (hasFileMedia || tip === 'poll' || tip === 'location') && styles.msgCapPad]}>
                {displayBody}
              </Text>
            ) : null}
            {hasVisibleContent && tip !== 'voice' ? (
              <View style={styles.msgFooter}>
                {time ? <Text style={styles.msgTime}>{time}</Text> : null}
                {receipt ? (
                  <View style={styles.ticksWrap}>
                    {receipt.state === 'sent' ? (
                      <Icon.Delivered
                        size={14}
                        color={receipt.read ? chatTheme.tickRead : chatTheme.tickDefault}
                        strokeWidth={2.4}
                      />
                    ) : (
                      <Icon.Read
                        size={14}
                        color={receipt.read ? chatTheme.tickRead : chatTheme.tickDefault}
                        strokeWidth={2.4}
                      />
                    )}
                  </View>
                ) : null}
              </View>
            ) : null}
          </Pressable>
          </ChatSwipeToReply>
          {reaction ? (
            <View style={[styles.reactionChip, mine ? styles.reactionChipMine : styles.reactionChipTheirs]}>
              <Text style={styles.reactionEmoji}>{reaction}</Text>
            </View>
          ) : null}
        </View>
      )
    },
    [
      uidNorm,
      isDm,
      memberReads,
      uid,
      senderNameByUserId,
      senderPhotoByUserId,
      chatTheme,
      styles,
      pollDetails,
      votingPollId,
      handlePollVote,
      handleSwipeReply,
      openMessageActions,
      reactionsById,
    ],
  )

  const keyExtractor = useCallback((item) => String(item.id), [])

  const keyboardOffset = 0
  const composerBottomPad = useMemo(() => {
    if (attachSheetOpen) return 6
    if (keyboardVisible) return 4
    return Math.max(insets.bottom, 6)
  }, [attachSheetOpen, keyboardVisible, insets.bottom])

  const headerSubtitle = useMemo(() => {
    if (isDm) return formatChatPresence(peerPresence)
    if (groupMemberNames.length) {
      const joined = groupMemberNames.join(' / ')
      return joined.length > 46 ? `${joined.slice(0, 46)}…` : joined
    }
    if (groupCreatorLabel) return `Ekleyen: ${groupCreatorLabel}`
    return ''
  }, [isDm, peerPresence, groupMemberNames, groupCreatorLabel])

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
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor={chatTheme.header} />
        <Text style={styles.err}>Kanal bulunamadı.</Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' && !attachSheetOpen ? 'padding' : undefined}
      keyboardVerticalOffset={attachSheetOpen ? 0 : keyboardOffset}
    >
      <StatusBar barStyle="light-content" backgroundColor={chatTheme.header} />
      <View style={styles.page}>
        <ChatRoomWallpaper chatBg={chatTheme.chatBg} doodleColor={chatTheme.wallpaperDoodle} />
        <View style={[styles.topBar, { paddingTop: insets.top + 2 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={12}>
            <ChevronLeft size={26} color={chatTheme.textHeader} strokeWidth={2} />
          </TouchableOpacity>
          {!isDm ? (
            <View style={styles.headerGroupAvatar}>
              <Users size={20} color={chatTheme.textHeader} strokeWidth={2} />
            </View>
          ) : (
            <ChatProfileAvatar
              name={headerTitle}
              photoPath={isDm ? senderPhotoByUserId[dmPeerId] : null}
              size="sm"
            />
          )}
          <TouchableOpacity
            style={styles.titleCol}
            activeOpacity={0.75}
            onPress={() => {
              if (!isDm) setGroupInfoVisible(true)
            }}
          >
            <Text style={styles.topTitle} numberOfLines={1}>
              {headerTitle}
            </Text>
            {headerSubtitle ? (
              <Text
                style={[
                  styles.presenceSub,
                  headerSubtitle === 'Çevrimiçi' && styles.presenceSubOnline,
                ]}
                numberOfLines={1}
              >
                {headerSubtitle}
              </Text>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerVideoBtn}
            activeOpacity={0.75}
            onPress={() => Alert.alert('Görüntülü arama', 'Bu sürümde görüntülü arama henüz desteklenmiyor.')}
          >
            <Video size={22} color={chatTheme.textHeader} strokeWidth={2} />
            <ChevronDown size={14} color={chatTheme.textSecondary} strokeWidth={2.4} />
          </TouchableOpacity>
        </View>
        {!isDm ? (
          <Modal
            visible={groupInfoVisible}
            animationType="fade"
            transparent
            onRequestClose={() => setGroupInfoVisible(false)}
          >
            <View style={styles.groupModalRoot}>
              <Pressable style={styles.groupModalBackdrop} onPress={() => setGroupInfoVisible(false)} />
              <View style={styles.groupModalCard}>
                <Text style={styles.groupModalTitle}>{headerTitle || 'Grup Bilgisi'}</Text>
                <Text style={styles.groupModalCreator}>
                  Ekleyen: {groupCreatorLabel || 'Bilinmiyor'}
                </Text>
                <Text style={styles.groupModalMembersTitle}>Üyeler</Text>
                <FlatList
                  data={groupMemberNames}
                  keyExtractor={(item, idx) => `${item}-${idx}`}
                  style={styles.groupModalList}
                  contentContainerStyle={styles.groupModalListContent}
                  renderItem={({ item }) => <Text style={styles.groupModalMemberRow}>• {item}</Text>}
                  ListEmptyComponent={<Text style={styles.groupModalEmpty}>Üye bilgisi bulunamadı</Text>}
                />
                <TouchableOpacity
                  style={styles.groupModalCloseBtn}
                  onPress={() => setGroupInfoVisible(false)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.groupModalCloseText}>Kapat</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        ) : null}
        {selectedMessage ? (
          <Modal
            visible
            animationType="fade"
            transparent
            onRequestClose={() => setSelectedMessage(null)}
          >
            <View style={styles.groupModalRoot}>
              <Pressable style={styles.groupModalBackdrop} onPress={() => setSelectedMessage(null)} />
              <View style={styles.groupModalCard}>
                <Text style={styles.groupModalTitle}>Mesaj bilgisi</Text>
                {(() => {
                  const info = buildMessageAudit(selectedMessage)
                  return (
                    <>
                      <Text style={styles.groupModalMembersTitle}>Okuyanlar</Text>
                      <Text style={styles.groupModalCreator}>{info.read.length ? info.read.join(', ') : 'Henüz yok'}</Text>
                      <Text style={[styles.groupModalMembersTitle, { marginTop: 10 }]}>İletilenler</Text>
                      <Text style={styles.groupModalCreator}>{info.delivered.length ? info.delivered.join(', ') : 'Yok'}</Text>
                    </>
                  )
                })()}
                <TouchableOpacity
                  style={styles.groupModalCloseBtn}
                  onPress={() => setSelectedMessage(null)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.groupModalCloseText}>Kapat</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        ) : null}

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={chatTheme.accent} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={keyExtractor}
            renderItem={renderMsg}
            style={styles.msgListFlex}
            contentContainerStyle={styles.msgList}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="none"
            onContentSizeChange={scrollToEnd}
            initialNumToRender={14}
            maxToRenderPerBatch={12}
            windowSize={12}
            removeClippedSubviews={Platform.OS === 'android'}
            ListHeaderComponent={
              hasOlder ? (
                <TouchableOpacity
                  style={styles.loadOlderBtn}
                  onPress={() => void loadOlder()}
                  disabled={loadingOlder}
                  activeOpacity={0.75}
                >
                  {loadingOlder ? (
                    <ActivityIndicator size="small" color={chatTheme.textSecondary} />
                  ) : (
                    <Text style={styles.loadOlderText}>Daha eski mesajlar</Text>
                  )}
                </TouchableOpacity>
              ) : null
            }
          />
        )}

        <View style={[styles.composer, { paddingBottom: composerBottomPad }]}>
          {pendingAttachment ? (
            <View style={styles.pendingBar}>
              <Text style={styles.pendingHint} numberOfLines={1}>
                Ek: {pendingAttachment.fileName}
              </Text>
              <TouchableOpacity onPress={() => setPendingAttachment(null)} hitSlop={8}>
                <Text style={styles.pendingClear}>Kaldır</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <ChatReplyBar
            theme={chatTheme}
            replyTo={replyTo}
            myName={senderNameByUserId[uidNorm] || ''}
            senderLabel={
              replyTo
                ? senderNameByUserId[normalizeChatUuid(replyTo.gonderen_kullanici_id)] || 'Kullanıcı'
                : ''
            }
            onClear={() => setReplyTo(null)}
          />
          <View style={[styles.composerRow, isRecording && styles.composerRowRecording]}>
            {isRecording ? (
              <ChatVoiceRecordingBar
                theme={chatTheme}
                durationMs={durationMs}
                meterSamples={meterSamples}
                isPaused={isPaused}
                sending={sending}
                onCancel={() => void cancelVoiceRecord()}
                onPauseToggle={() => void toggleVoicePause()}
                onSend={() => void onRecordingSend()}
              />
            ) : (
              <>
            <TouchableOpacity
              style={styles.composerIconBtn}
              onPress={toggleAttachSheet}
              disabled={sending}
              accessibilityLabel={attachSheetOpen ? 'Klavyeyi aç' : 'Dosya ekle'}
            >
              <Animated.View
                style={{
                  transform: [
                    {
                      rotate: plusRotate.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '45deg'],
                      }),
                    },
                  ],
                }}
              >
                <Plus size={24} color={chatTheme.icon} strokeWidth={2} />
              </Animated.View>
            </TouchableOpacity>
            <View style={styles.inputPill}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder=""
                placeholderTextColor={chatTheme.textSecondary}
                value={draft}
                onChangeText={setDraft}
                onFocus={() => setAttachSheetOpen(false)}
                multiline
                maxLength={8000}
                editable={!sending}
              />
              <TouchableOpacity
                style={styles.inlineIconBtn}
                onPress={openEmojiPicker}
                disabled={sending}
                accessibilityLabel="Emoji"
              >
                <Smile size={22} color={chatTheme.icon} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.composerIconBtn}
              onPress={() => void takePhotoCamera()}
              disabled={sending}
              accessibilityLabel="Kamera"
            >
              <Camera size={24} color={chatTheme.icon} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.composerIconBtn}
              onPress={() => {
                if (canSend) void onSend()
                else void onMicPress()
              }}
              disabled={sending}
              accessibilityLabel={canSend ? 'Gönder' : 'Sesli mesaj'}
            >
              {canSend ? (
                <Send size={22} color={chatTheme.icon} strokeWidth={2.2} />
              ) : (
                <Mic size={24} color={chatTheme.icon} strokeWidth={2} />
              )}
            </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        <ChatAttachmentSheet
          visible={attachSheetOpen}
          theme={chatTheme}
          onPick={handleAttachmentPick}
          bottomInset={attachSheetOpen ? Math.max(insets.bottom, 6) : 0}
        />
      </View>

      <ChatPollCreateModal
        visible={pollModalOpen}
        theme={chatTheme}
        submitting={pollSubmitting}
        onClose={() => setPollModalOpen(false)}
        onSubmit={submitPoll}
      />

      <ChatEmojiPicker
        visible={emojiPickerOpen}
        onClose={() => setEmojiPickerOpen(false)}
        onPick={(emoji) => setDraft((d) => `${d || ''}${emoji}`)}
      />

      <ChatMessageActionOverlay
        visible={!!actionAnchor}
        theme={chatTheme}
        anchor={actionAnchor}
        onClose={closeMessageActions}
        onAction={handleMessageAction}
      />

      <ChatMediaSendPreview
        visible={!!mediaPreview}
        media={mediaPreview}
        caption={mediaPreviewCaption}
        onCaptionChange={setMediaPreviewCaption}
        senderName={senderNameByUserId[uidNorm] || profile?.ad_soyad || 'Siz'}
        senderPhotoPath={profile?.profil_foto_yol || senderPhotoByUserId[uidNorm]}
        sending={sending}
        theme={chatTheme}
        onClose={() => {
          if (sending) return
          setMediaPreview(null)
          setMediaPreviewCaption('')
        }}
        onSend={() => void handleMediaPreviewSend()}
      />

      <ChatForwardModal
        visible={!!forwardSource}
        theme={chatTheme}
        userId={uid}
        companyId={companyId}
        excludeChannelId={channelId}
        sourceMessage={forwardSource}
        onClose={() => setForwardSource(null)}
        onForward={(row) => void handleForwardToChannel(row)}
        forwarding={forwarding}
      />
    </KeyboardAvoidingView>
  )
}


function buildChatStyles(t) {
  return StyleSheet.create({
  flex: { flex: 1 },
  page: {
    flex: 1,
    backgroundColor: t.chatBg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingBottom: 8,
    gap: 8,
    backgroundColor: t.header,
    minHeight: 52,
    zIndex: 2,
  },
  headerGroupAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.groupAvatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerVideoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  backBtn: {
    padding: 6,
  },
  topTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: t.textHeader,
  },
  presenceSub: {
    marginTop: 1,
    fontSize: 12,
    fontWeight: '500',
    color: t.presenceOnHeader || 'rgba(255,255,255,0.88)',
  },
  presenceSubOnline: {
    color: t.presenceOnlineOnHeader || '#BBF7D0',
    fontWeight: '600',
  },
  groupModalRoot: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  groupModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  groupModalCard: {
    marginHorizontal: 20,
    borderRadius: 14,
    backgroundColor: t.receivedBubble,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    maxHeight: '72%',
  },
  groupModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: t.textPrimary,
  },
  groupModalCreator: {
    marginTop: 6,
    fontSize: 13,
    color: t.textSecondary,
    fontWeight: '600',
  },
  groupModalMembersTitle: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '800',
    color: t.textPrimary,
  },
  groupModalList: {
    marginTop: 6,
  },
  groupModalListContent: {
    paddingBottom: 8,
  },
  groupModalMemberRow: {
    fontSize: 14,
    lineHeight: 21,
    color: t.textPrimary,
    paddingVertical: 2,
  },
  groupModalEmpty: {
    fontSize: 13,
    color: t.textSecondary,
    marginTop: 4,
  },
  groupModalCloseBtn: {
    marginTop: 10,
    alignSelf: 'flex-end',
    borderRadius: 10,
    backgroundColor: t.accent,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  groupModalCloseText: {
    color: Colors.surface,
    fontWeight: '700',
    fontSize: 13,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  msgListFlex: {
    flex: 1,
    zIndex: 1,
  },
  msgList: {
    paddingHorizontal: 4,
    paddingTop: 6,
    paddingBottom: 10,
    flexGrow: 1,
  },
  loadOlderBtn: {
    alignSelf: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: t.receivedBubble,
  },
  loadOlderText: {
    fontSize: 13,
    fontWeight: '600',
    color: t.textSecondary,
  },
  bubbleWrap: {
    marginBottom: 2,
    flexDirection: 'row',
    paddingHorizontal: 2,
    alignItems: 'flex-end',
    position: 'relative',
  },
  bubbleWrapWithReaction: {
    marginBottom: 12,
  },
  bubbleWrapMine: {
    justifyContent: 'flex-end',
  },
  bubbleWrapTheirs: {
    justifyContent: 'flex-start',
  },
  avatarSlot: {
    width: 28,
    marginRight: 4,
    marginBottom: 2,
    alignItems: 'center',
  },
  msgForwardBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    marginBottom: 4,
    marginHorizontal: 2,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  bubble: {
    maxWidth: '100%',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingTop: 5,
    paddingBottom: 4,
  },
  bubbleMine: {
    backgroundColor: t.sentBubble,
    borderTopRightRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.sentBubbleBorder,
  },
  bubbleTheirs: {
    backgroundColor: t.receivedBubble,
    borderTopLeftRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.receivedBubbleBorder,
  },
  bubbleVoiceMine: {
    backgroundColor: t.sentBubbleVoice || t.sentBubble,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 252,
    maxWidth: 300,
  },
  bubbleVoiceTheirs: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 252,
    maxWidth: 300,
  },
  bubblePressed: {
    opacity: 0.92,
  },
  reactionChip: {
    position: 'absolute',
    bottom: -6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: t.receivedBubble,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.receivedBubbleBorder,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  reactionChipMine: {
    right: 4,
  },
  reactionChipTheirs: {
    left: 36,
  },
  reactionEmoji: {
    fontSize: 16,
  },
  msgText: {
    fontSize: 16,
    lineHeight: 22,
    color: t.textPrimary,
  },
  msgSenderGroup: {
    marginBottom: 3,
    fontSize: 13,
    fontWeight: '700',
  },
  msgCapPad: {
    marginTop: 6,
  },
  msgFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
    alignSelf: 'flex-end',
  },
  msgTime: {
    fontSize: 11,
    fontWeight: '400',
    color: t.textTime,
  },
  ticks: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -2,
  },
  ticksMine: { color: 'rgba(255,255,255,0.65)' },
  ticksTheirs: { color: Colors.mutedText },
  ticksRead: { color: kitPalette.info[500] },
  attImg: {
    width: 220,
    height: 220,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  videoThumbOuter: {
    borderRadius: 12,
    overflow: 'hidden',
    maxWidth: 260,
    alignSelf: 'flex-start',
  },
  videoThumbInner: {
    width: 220,
    height: 160,
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  videoThumbPlayer: {
    width: '100%',
    height: '100%',
  },
  videoThumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
    flexDirection: 'row',
    gap: 6,
  },
  ticksWrap: {
    marginLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoThumbOverlayText: {
    color: Colors.surface,
    fontWeight: '800',
    fontSize: 15,
  },
  videoModalRoot: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.88)',
  },
  videoModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  videoModalSheet: {
    marginHorizontal: 12,
    alignItems: 'stretch',
  },
  videoModalPlayer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: kitPalette.slate[900],
    borderRadius: 12,
    overflow: 'hidden',
  },
  videoModalClose: {
    alignSelf: 'center',
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  videoModalCloseText: {
    color: Colors.surface,
    fontWeight: '800',
    fontSize: 15,
  },
  attFileChip: {
    minWidth: 180,
    maxWidth: 280,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: t.receivedBubbleBorder,
    gap: 6,
  },
  attFileChipMine: {
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  attFileChipHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  attFileIcon: {
    fontSize: 18,
    lineHeight: 22,
  },
  attFileName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '700',
    color: t.textPrimary,
  },
  attFileNameMine: {
    color: t.textPrimary,
  },
  attFilePreview: {
    fontSize: 13,
    lineHeight: 18,
    color: t.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  attFilePreviewMine: {
    color: t.textSecondary,
  },
  attFilePreviewLoader: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  attFileHint: {
    fontSize: 12,
    lineHeight: 16,
    color: t.textSecondary,
  },
  attFileHintMine: {
    color: t.textSecondary,
  },
  attFail: { fontSize: 13, color: t.textSecondary },
  attFailMine: { color: t.textSecondary },
  attPending: { fontSize: 13, color: t.textSecondary },
  attPendingMine: { color: t.textSecondary },
  composer: {
    backgroundColor: t.composerBg,
    paddingTop: 5,
    paddingHorizontal: 4,
    zIndex: 2,
  },
  pendingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 6,
    gap: 8,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  composerRowRecording: {
    alignItems: 'center',
    backgroundColor: t.inputBg,
    borderRadius: 28,
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.receivedBubbleBorder,
  },
  composerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  inputPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 40,
    borderRadius: 20,
    backgroundColor: t.inputBg,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 4,
    marginBottom: 2,
  },
  inlineIconBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 32,
    maxHeight: 120,
    paddingHorizontal: 0,
    paddingVertical: Platform.OS === 'ios' ? 7 : 5,
    fontSize: 16,
    color: t.textPrimary,
    backgroundColor: 'transparent',
  },
  pendingHint: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: t.textSecondary,
  },
  pendingClear: {
    color: t.accent,
    fontWeight: '700',
    fontSize: 13,
  },
  err: {
    padding: 24,
    color: Colors.error,
    fontWeight: '600',
  },
  })
}
