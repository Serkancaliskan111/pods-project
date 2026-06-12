import React, { useMemo } from 'react'
import {
  View,
  Modal,
  Pressable,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Text as RNText,
  Platform,
  useWindowDimensions,
} from 'react-native'
import { X } from 'lucide-react-native'
import { CHAT_EMOJI_LIST } from '../lib/chatEmojiData'
import { Text, palette, spacing, radii } from '../ui'

const COLS = 8
const SHEET_MAX_HEIGHT = 340

export default function ChatEmojiPicker({ visible, onClose, onPick }) {
  const { width: screenWidth } = useWindowDimensions()

  const cellSize = useMemo(() => {
    const horizontalPad = spacing.md * 2
    return Math.floor((screenWidth - horizontalPad) / COLS)
  }, [screenWidth])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Emoji panelini kapat" />

        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text variant="bodySm" weight="SemiBold" color={palette.slate[700]}>
              Emoji seç
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Kapat"
            >
              <X size={20} color={palette.slate[500]} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={CHAT_EMOJI_LIST}
            keyExtractor={(item, i) => `${item}-${i}`}
            numColumns={COLS}
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.row}
            renderItem={({ item }) => (
              <TouchableOpacity
                activeOpacity={0.65}
                onPress={() => onPick?.(item)}
                style={[styles.cell, { width: cellSize, height: cellSize }]}
                accessibilityLabel={`Emoji ${item}`}
              >
                <RNText style={[styles.emoji, { lineHeight: cellSize }]} allowFontScaling={false}>
                  {item}
                </RNText>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    maxHeight: SHEET_MAX_HEIGHT,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  grid: {
    paddingBottom: spacing.sm,
  },
  row: {
    justifyContent: 'flex-start',
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 28,
    textAlign: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
})
