import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { X } from 'lucide-react-native'
import { buildMessagePreview } from '../../lib/chatMessagePreview'
import { quoteColorForSender } from '../../lib/chatQuoteColors'

export default function ChatReplyBar({ theme, replyTo, senderLabel, myName, onClear }) {
  if (!replyTo) return null
  const preview = buildMessagePreview(replyTo)
  const accent = quoteColorForSender(senderLabel, myName, theme)
  const bg = theme?.quoteBgMine || 'rgba(0,0,0,0.05)'

  return (
    <View style={[styles.wrap, { backgroundColor: bg, borderLeftColor: accent }]}>
      <View style={styles.body}>
        <Text style={[styles.name, { color: accent }]} numberOfLines={1}>
          {senderLabel || 'Yanıt'}
        </Text>
        <Text style={[styles.preview, { color: theme?.textSecondary }]} numberOfLines={1}>
          {preview}
        </Text>
      </View>
      <TouchableOpacity onPress={onClear} hitSlop={10} accessibilityLabel="Yanıtı kaldır">
        <X size={18} color={theme?.textSecondary} strokeWidth={2.2} />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 6,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderLeftWidth: 3,
    borderRadius: 8,
    gap: 8,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  name: {
    fontSize: 12,
    fontWeight: '700',
  },
  preview: {
    fontSize: 12,
  },
})
