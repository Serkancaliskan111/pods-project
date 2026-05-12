import React from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { StatusBar } from 'expo-status-bar'
import EvidenceVideoPlayer from './EvidenceVideoPlayer'
import Theme from '../theme/theme'

const ThemeObj = Theme?.default ?? Theme
const { Colors, Typography } = ThemeObj

/**
 * Tek bir video URI'sini tam ekran modal'da büyük olarak önizler.
 * Yerel `file://` URI'leri ve uzak URL'lerin ikisini de destekler (expo-video VideoView).
 */
export default function VideoPreviewModal({
  visible,
  uri,
  title,
  durationSec,
  onRequestClose,
}) {
  const insets = useSafeAreaInsets()
  if (!visible || !uri) return null

  const formatDur = (sec) => {
    if (!Number.isFinite(Number(sec))) return null
    const s = Math.max(0, Math.floor(Number(sec)))
    const m = Math.floor(s / 60)
    const r = s % 60
    return `${m}:${String(r).padStart(2, '0')}`
  }
  const dur = formatDur(durationSec)

  return (
    <Modal
      visible
      transparent={false}
      animationType="fade"
      statusBarTranslucent={Platform.OS === 'android'}
      onRequestClose={onRequestClose}
    >
      <StatusBar style="light" />
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title} numberOfLines={1}>
              {title || 'Video Önizleme'}
            </Text>
            {dur ? <Text style={styles.subtitle}>{dur}</Text> : null}
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onRequestClose}
            activeOpacity={0.85}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Kapat"
          >
            <X size={20} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
        <View style={styles.playerWrap}>
          <EvidenceVideoPlayer uri={uri} style={styles.player} contentFit="contain" />
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.alpha?.black72 ? '#000' : '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  headerTextWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  title: {
    color: '#fff',
    fontSize: Typography.body.fontSize,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.75)',
    fontSize: Typography.caption.fontSize,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerWrap: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  player: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
  },
})
