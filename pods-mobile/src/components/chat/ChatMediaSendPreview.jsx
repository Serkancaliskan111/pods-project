import React from 'react'
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Image,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Send, X } from 'lucide-react-native'
import EvidenceVideoPlayer from '../EvidenceVideoPlayer'
import ChatProfileAvatar from './ChatProfileAvatar'

export default function ChatMediaSendPreview({
  visible,
  media,
  caption,
  onCaptionChange,
  senderName,
  senderPhotoPath,
  sending,
  theme,
  onClose,
  onSend,
}) {
  const insets = useSafeAreaInsets()
  if (!visible || !media?.uri) return null

  const isVideo = media.isVideo || String(media.mimeType || '').startsWith('video/')
  const accent = theme?.accent || '#2563eb'

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity style={styles.topBtn} onPress={onClose} disabled={sending} hitSlop={12}>
              <X size={26} color="#fff" strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          <View style={styles.previewArea}>
            {isVideo ? (
              <EvidenceVideoPlayer
                uri={media.uri}
                nativeControls
                contentFit="contain"
                style={styles.video}
              />
            ) : (
              <Image source={{ uri: media.uri }} style={styles.image} resizeMode="contain" />
            )}
          </View>

          <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.captionWrap}>
              <TextInput
                style={styles.captionInput}
                placeholder="Açıklama ekleyin…"
                placeholderTextColor="rgba(255,255,255,0.55)"
                value={caption}
                onChangeText={onCaptionChange}
                multiline
                maxLength={2000}
                editable={!sending}
              />
            </View>

            <View style={styles.actionRow}>
              <View style={styles.senderChip}>
                <ChatProfileAvatar name={senderName} photoPath={senderPhotoPath} size="xs" />
                <Text style={styles.senderLabel} numberOfLines={1}>
                  {senderName || 'Siz'}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: accent }]}
                onPress={onSend}
                disabled={sending}
                accessibilityLabel="Gönder"
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Send size={22} color="#fff" strokeWidth={2.2} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0b0b0b',
  },
  flex: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    zIndex: 2,
  },
  topBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  bottom: {
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  captionWrap: {
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    minHeight: 46,
    justifyContent: 'center',
  },
  captionInput: {
    color: '#fff',
    fontSize: 16,
    maxHeight: 96,
    padding: 0,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  senderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
    paddingVertical: 4,
  },
  senderLabel: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  sendBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
})
