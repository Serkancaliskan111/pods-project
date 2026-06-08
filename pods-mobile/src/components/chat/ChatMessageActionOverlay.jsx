import React, { useEffect, useRef } from 'react'
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
} from 'react-native'
import { CornerUpLeft, Forward, Info, Pin, Plus, Star } from 'lucide-react-native'
import { CHAT_QUICK_REACTIONS, buildMessagePreview } from '../../lib/chatMessagePreview'

const MENU_ITEMS = [
  { key: 'reply', label: 'Cevapla', Icon: CornerUpLeft },
  { key: 'forward', label: 'İlet', Icon: Forward },
  { key: 'info', label: 'Bilgi', Icon: Info },
  { key: 'star', label: 'Yıldız ekle', Icon: Star },
  { key: 'pin', label: 'Sabitle', Icon: Pin },
]

export default function ChatMessageActionOverlay({ visible, theme, anchor, onClose, onAction }) {
  const { width: winW, height: winH } = useWindowDimensions()
  const scale = useRef(new Animated.Value(0.94)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!visible) return
    scale.setValue(0.94)
    opacity.setValue(0)
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 130 }),
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start()
  }, [visible, scale, opacity])

  if (!visible || !anchor) return null

  const menuW = Math.min(260, winW - 32)
  const reactionW = Math.min(340, winW - 24)
  const anchorX = anchor.x ?? winW / 2
  const anchorY = anchor.y ?? winH / 2
  const anchorW = anchor.width ?? 200
  const anchorH = anchor.height ?? 48
  const mine = !!anchor.mine

  const menuLeft = mine
    ? Math.max(12, anchorX + anchorW - menuW)
    : Math.min(winW - menuW - 12, Math.max(12, anchorX))
  const reactionLeft = Math.max(12, Math.min(winW - reactionW - 12, anchorX + anchorW / 2 - reactionW / 2))

  const previewText = anchor.message ? buildMessagePreview(anchor.message) : ''
  const bubbleW = Math.min(Math.max(anchorW, 160), winW - 24)
  const bubbleLeft = mine
    ? Math.max(12, anchorX + anchorW - bubbleW)
    : Math.min(winW - bubbleW - 12, Math.max(12, anchorX))

  let blockTop = Math.max(72, anchorY - 58)
  if (blockTop + 56 + 12 + anchorH + 12 + 280 > winH - 24) {
    blockTop = Math.min(winH - 360, anchorY + anchorH + 10)
  }

  const bubbleTop = blockTop + 56 + 8
  const menuTop = bubbleTop + anchorH + 10

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.dim} />
      </Pressable>

      <Animated.View pointerEvents="box-none" style={[styles.layer, { opacity, transform: [{ scale }] }]}>
        <View style={[styles.reactionBar, { left: reactionLeft, top: blockTop, width: reactionW }]}>
          {CHAT_QUICK_REACTIONS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={styles.emojiBtn}
              onPress={() => onAction?.('react', emoji)}
              accessibilityLabel={`Tepki ${emoji}`}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.emojiPlus} onPress={() => onAction?.('react-more')}>
            <Plus size={18} color="rgba(255,255,255,0.75)" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.previewBubble,
            {
              left: bubbleLeft,
              top: bubbleTop,
              width: bubbleW,
              minHeight: Math.max(anchorH, 44),
              backgroundColor: mine ? theme?.sentBubbleVoice || theme?.sentBubble : theme?.receivedBubble,
              borderColor: mine ? theme?.sentBubbleBorder : theme?.receivedBubbleBorder,
            },
          ]}
        >
          <Text style={[styles.previewText, { color: theme?.textPrimary }]} numberOfLines={4}>
            {previewText}
          </Text>
        </View>

        <View
          style={[
            styles.menuCard,
            {
              left: menuLeft,
              top: menuTop,
              width: menuW,
              backgroundColor: theme?.receivedBubble || '#fff',
            },
          ]}
        >
          {MENU_ITEMS.map((item, idx) => {
            const IconComp = item.Icon
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.menuRow, idx > 0 && styles.menuRowBorder]}
                activeOpacity={0.7}
                onPress={() => onAction?.(item.key)}
              >
                <Text style={[styles.menuLabel, { color: theme?.textPrimary }]}>{item.label}</Text>
                <IconComp size={20} color={theme?.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            )
          })}
        </View>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
  reactionBar: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 28,
    backgroundColor: 'rgba(28,32,36,0.94)',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  emojiBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 26,
  },
  emojiPlus: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBubble: {
    position: 'absolute',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    justifyContent: 'center',
  },
  previewText: {
    fontSize: 15,
    lineHeight: 21,
  },
  menuCard: {
    position: 'absolute',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  menuRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
})
