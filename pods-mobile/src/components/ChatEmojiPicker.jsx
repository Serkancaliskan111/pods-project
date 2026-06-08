import React from 'react'
import { View, Modal, Pressable, FlatList, TouchableOpacity } from 'react-native'
import { CHAT_EMOJI_LIST } from '../lib/chatEmojiData'
import { Text, palette, spacing, radii } from '../ui'

export default function ChatEmojiPicker({ visible, onClose, onPick }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.35)' }} onPress={onClose}>
        <Pressable
          style={{
            marginTop: 'auto',
            backgroundColor: palette.surface,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            padding: spacing.md,
            maxHeight: 320,
          }}
          onPress={(e) => e.stopPropagation?.()}
        >
          <Text variant="bodySm" weight="SemiBold" color={palette.slate[700]} style={{ marginBottom: spacing.sm }}>
            Emoji seç
          </Text>
          <FlatList
            data={CHAT_EMOJI_LIST}
            keyExtractor={(item, i) => `${item}-${i}`}
            numColumns={8}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => {
                  onPick?.(item)
                  onClose?.()
                }}
                style={{ width: '12.5%', padding: 6, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 24 }}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  )
}
