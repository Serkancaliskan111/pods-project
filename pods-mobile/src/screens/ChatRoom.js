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
  Linking,
  Modal,
  Pressable,
} from 'react-native'
import ImageViewing from 'react-native-image-viewing'
import EvidenceVideoPlayer from '../components/EvidenceVideoPlayer'
import { useRoute, useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { ChevronLeft, FileText } from 'lucide-react-native'
import { useAuth } from '../contexts/AuthContext'
import Theme from '../theme/theme'
import PremiumBackgroundPattern from '../components/PremiumBackgroundPattern'
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
} from '../lib/chatApi'

const ThemeObj = Theme?.default ?? Theme
const { Colors, Typography } = ThemeObj

function formatChatPresence(p) {
  if (!p) return ''
  if (p.mobil_online) return 'Çevrimiçi'
  const t = p.mobil_last_seen_at ? new Date(p.mobil_last_seen_at).getTime() : 0
  if (t && Date.now() - t < 90000) return 'Çevrimiçi'
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

function readReceiptLabel(msgId, mine, isDm, peerMaxRead) {
  if (!mine) return null
  if (!isDm) return { ticks: '✓', read: false, title: 'Gönderildi' }
  if (peerMaxRead == null) return { ticks: '✓', read: false, title: 'İletildi' }
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

function ChatAttachmentMobile({ row, mine }) {
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
              <Text style={styles.videoThumbOverlayText}>▶ Oynat</Text>
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
    return (
      <TouchableOpacity onPress={() => Linking.openURL(url)} activeOpacity={0.75}>
        <Text style={[styles.attLink, mine && styles.attLinkMine]}>
          📎 Dosyayı aç — {row?.ek_orijinal_ad || 'dosya'}
        </Text>
      </TouchableOpacity>
    )
  }

  return <Text style={[styles.attPending, mine && styles.attPendingMine]}>Ek hazırlanıyor…</Text>
}

export default function ChatRoom() {
  const route = useRoute()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { user, personel } = useAuth()
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
  const [memberReads, setMemberReads] = useState([])
  const [peerPresence, setPeerPresence] = useState(null)
  const [pendingAttachment, setPendingAttachment] = useState(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlder, setHasOlder] = useState(true)
  const listRef = useRef(null)
  const resyncTimerRef = useRef(null)
  const firstMsgIdRef = useRef(null)

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

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: false })
    })
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
    try {
      const [rows, k] = await Promise.all([
        fetchMessages(channelId, { limit: CHAT_MESSAGES_PAGE_SIZE }),
        fetchKanal(channelId),
      ])
      setMessages(sortMessagesByIdAsc(rows))
      setHasOlder(rows.length >= CHAT_MESSAGES_PAGE_SIZE)
      if (k) await applyKanalHeader(k)
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
    setHasOlder(true)
    setPendingAttachment(null)
  }, [channelId])

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
      setPendingAttachment({
        uri: a.uri,
        mimeType: a.mimeType || (a.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        fileName: a.fileName || `media_${Date.now()}`,
        fileSize: a.fileSize,
      })
    } catch (e) {
      Alert.alert('Hata', e?.message || String(e))
    }
  }, [])

  const pickDocument = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: '*/*',
      })
      if (res.canceled) return
      const a = res.assets?.[0]
      if (!a?.uri) return
      setPendingAttachment({
        uri: a.uri,
        mimeType: a.mimeType || 'application/octet-stream',
        fileName: a.name || 'dosya',
        fileSize: a.size,
      })
    } catch (e) {
      Alert.alert('Hata', e?.message || String(e))
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
      setPendingAttachment({
        uri: a.uri,
        mimeType: a.mimeType || 'image/jpeg',
        fileName: a.fileName || `kamera_foto_${Date.now()}.jpg`,
        fileSize: a.fileSize,
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

  const attachMenu = useCallback(() => {
    Alert.alert('Dosya ekle', 'Kaynak seçin', [
      { text: 'Galeri (foto/video)', onPress: () => void pickGallery() },
      { text: 'Fotoğraf çek', onPress: () => void takePhotoCamera() },
      { text: 'Video çek', onPress: () => void takeVideoCamera() },
      { text: 'Belge', onPress: () => void pickDocument() },
      { text: 'İptal', style: 'cancel' },
    ])
  }, [pickGallery, pickDocument, takePhotoCamera, takeVideoCamera])

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

  const onSend = useCallback(async () => {
    const t = draft.trim()
    const att = pendingAttachment
    if ((!t && !att) || !channelId || sending) return
    setSending(true)
    const draftBk = draft
    const attBk = pendingAttachment
    setDraft('')
    setPendingAttachment(null)
    try {
      let mid
      if (att) {
        const uploaded = await uploadChatBlob(channelId, att, {
          contentType: att.mimeType,
          fileName: att.fileName,
        })
        const tip = inferMesajTipiFromMime(uploaded.ek_mime || att.mimeType)
        mid = await sendMessage(channelId, t, {
          mesaj_tipi: tip,
          ek_yol: uploaded.ek_yol,
          ek_orijinal_ad: uploaded.ek_orijinal_ad,
          ek_mime: uploaded.ek_mime,
          ek_boyut: uploaded.ek_boyut ?? att.fileSize ?? null,
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
        Alert.alert(
          'Mesaj doğrulanamadı',
          'Sunucu migration’larını (chat medya / RLS) kontrol edin.',
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
      scrollToEnd()
    } catch (e) {
      const msg = e?.message || String(e)
      if (__DEV__) console.warn('[ChatRoom send]', msg)
      Alert.alert('Mesaj gönderilemedi', msg)
      setDraft(draftBk)
      setPendingAttachment(attBk)
    } finally {
      setSending(false)
    }
  }, [draft, pendingAttachment, channelId, sending, scrollToEnd])

  const renderMsg = useCallback(
    ({ item }) => {
      const mine = normalizeChatUuid(item.gonderen_kullanici_id) === uidNorm
      const time =
        item.olusturulma_at &&
        new Date(item.olusturulma_at).toLocaleTimeString('tr-TR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      const hasMedia = item.mesaj_tipi && item.mesaj_tipi !== 'text' && item.ek_yol
      const cap = (item.icerik || '').trim()
      const receipt = readReceiptLabel(item.id, mine, isDm, peerMaxReadId)

      return (
        <View style={[styles.bubbleWrap, mine ? styles.bubbleWrapMine : styles.bubbleWrapTheirs]}>
          <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
            {hasMedia ? <ChatAttachmentMobile row={item} mine={mine} /> : null}
            {cap ? (
              <Text style={[styles.msgText, mine ? styles.msgTextMine : styles.msgTextTheirs, hasMedia && styles.msgCapPad]}>
                {item.icerik}
              </Text>
            ) : null}
            <View style={styles.msgFooter}>
              {time ? <Text style={[styles.msgTime, mine ? styles.msgTimeMine : styles.msgTimeTheirs]}>{time}</Text> : null}
              {receipt ? (
                <Text
                  style={[styles.ticks, mine ? styles.ticksMine : styles.ticksTheirs, receipt.read && styles.ticksRead]}
                >
                  {receipt.ticks}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      )
    },
    [uidNorm, isDm, peerMaxReadId],
  )

  const keyExtractor = useCallback((item) => String(item.id), [])

  const keyboardOffset = useMemo(() => (Platform.OS === 'ios' ? 88 : 0), [])

  const canSend = (!!draft.trim() || !!pendingAttachment) && !sending

  if (!channelId) {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <Text style={styles.err}>Kanal bulunamadı.</Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardOffset}
    >
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <PremiumBackgroundPattern />
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={12}>
            <ChevronLeft size={26} color={Colors.text} strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.titleCol}>
            <Text style={styles.topTitle} numberOfLines={1}>
              {headerTitle}
            </Text>
            {isDm ? (
              <Text style={styles.presenceSub} numberOfLines={1}>
                {formatChatPresence(peerPresence)}
              </Text>
            ) : null}
          </View>
          <View style={{ width: 34 }} />
        </View>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={keyExtractor}
            renderItem={renderMsg}
            contentContainerStyle={styles.msgList}
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
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Text style={styles.loadOlderText}>Daha eski mesajlar</Text>
                  )}
                </TouchableOpacity>
              ) : null
            }
          />
        )}

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.composerActions}>
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={attachMenu}
              disabled={sending}
              accessibilityLabel="Medya veya belge menüsü"
            >
              <Text style={styles.attachBtnText}>＋</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={() => void pickDocument()}
              disabled={sending}
              accessibilityRole="button"
              accessibilityLabel="Belge yükle"
            >
              <FileText size={22} color={Colors.primary} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Mesaj…"
            placeholderTextColor={Colors.mutedText}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={8000}
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={() => void onSend()}
            disabled={!canSend}
          >
            <Text style={styles.sendBtnText}>Gönder</Text>
          </TouchableOpacity>
          {pendingAttachment ? (
            <Text style={styles.pendingHint} numberOfLines={2}>
              Ek: {pendingAttachment.fileName}{' '}
              <Text style={styles.pendingClear} onPress={() => setPendingAttachment(null)}>
                Kaldır
              </Text>
            </Text>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
    gap: 6,
  },
  titleCol: {
    flex: 1,
    alignItems: 'center',
  },
  backBtn: {
    padding: 4,
  },
  topTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    width: '100%',
  },
  presenceSub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: Colors.mutedText,
    textAlign: 'center',
    width: '100%',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  msgList: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    flexGrow: 1,
  },
  loadOlderBtn: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderRadius: ThemeObj.Radii?.md ?? 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.alpha?.gray20 ?? '#e2e8f0',
  },
  loadOlderText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  bubbleWrap: {
    marginBottom: 10,
    flexDirection: 'row',
  },
  bubbleWrapMine: {
    justifyContent: 'flex-end',
  },
  bubbleWrapTheirs: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMine: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.alpha?.gray20 ?? '#e2e8f0',
    borderBottomLeftRadius: 4,
  },
  msgText: {
    fontSize: Typography?.body?.fontSize ?? 15,
    lineHeight: 21,
  },
  msgCapPad: {
    marginTop: 8,
  },
  msgTextMine: { color: Colors.surface },
  msgTextTheirs: { color: Colors.text },
  msgFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  msgTime: {
    fontSize: 10,
    fontWeight: '600',
  },
  msgTimeMine: { color: 'rgba(255,255,255,0.75)' },
  msgTimeTheirs: { color: Colors.mutedText },
  ticks: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -2,
  },
  ticksMine: { color: 'rgba(255,255,255,0.65)' },
  ticksTheirs: { color: Colors.mutedText },
  ticksRead: { color: '#7dd3fc' },
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
    backgroundColor: '#000',
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
  attLink: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
  attLinkMine: { color: Colors.surface },
  attFail: { fontSize: 13, color: Colors.text },
  attFailMine: { color: Colors.surface },
  attPending: { fontSize: 13, color: Colors.mutedText },
  attPendingMine: { color: 'rgba(255,255,255,0.82)' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.alpha?.gray20 ?? '#e2e8f0',
    backgroundColor: Colors.surface,
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginBottom: 2,
  },
  attachBtn: {
    width: 40,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.alpha?.gray20 ?? '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  attachBtnText: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.primary,
    marginTop: -2,
  },
  input: {
    flex: 1,
    minWidth: 120,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.alpha?.gray20 ?? '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.inputBg ?? Colors.background,
    marginBottom: 2,
  },
  sendBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 2,
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  sendBtnText: {
    color: Colors.surface,
    fontWeight: '800',
    fontSize: 13,
  },
  pendingHint: {
    width: '100%',
    fontSize: 11,
    fontWeight: '600',
    color: Colors.mutedText,
    marginTop: -4,
  },
  pendingClear: {
    color: Colors.primary,
    fontWeight: '800',
  },
  err: {
    padding: 24,
    color: Colors.error,
    fontWeight: '600',
  },
})
