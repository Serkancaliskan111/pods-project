import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text, palette, shadows } from '../ui'

export function formatTabBadgeCount(count) {
  const n = Number(count) || 0
  if (n <= 0) return null
  if (n > 99) return '99+'
  return String(n)
}

export default function TabBarBadge({ count }) {
  const label = formatTabBadgeCount(count)
  if (!label) return null

  return (
    <View style={styles.badge}>
      <Text variant="caption" weight="ExtraBold" color={palette.surface} style={styles.text}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: palette.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.surface,
    zIndex: 2,
    ...shadows.sm,
  },
  text: {
    fontSize: 9,
    lineHeight: 11,
  },
})
