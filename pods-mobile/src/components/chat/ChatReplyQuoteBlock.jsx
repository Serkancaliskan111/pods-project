import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

export default function ChatReplyQuoteBlock({ theme, sender, preview, accentColor, mine }) {
  if (!sender && !preview) return null
  const accent = accentColor || theme?.accent || '#2563eb'
  const bg = mine ? theme?.quoteBgMine || 'rgba(0,0,0,0.04)' : theme?.quoteBgTheirs || 'rgba(0,0,0,0.05)'

  return (
    <View style={[styles.wrap, { backgroundColor: bg, borderLeftColor: accent }]}>
      <Text style={[styles.sender, { color: accent }]} numberOfLines={1}>
        {sender}
      </Text>
      <Text style={[styles.preview, { color: theme?.textSecondary }]} numberOfLines={2}>
        {preview}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderLeftWidth: 4,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 4,
    overflow: 'hidden',
  },
  sender: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  preview: {
    fontSize: 13,
    lineHeight: 18,
  },
})
