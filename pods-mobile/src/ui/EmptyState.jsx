import React from 'react'
import { View, StyleSheet } from 'react-native'
import Text from './Text'
import IconBubble from './IconBubble'
import { spacing, palette } from './tokens'

/**
 * Boş durum kartı. İkon, başlık, açıklama, opsiyonel CTA slotu.
 */
export default function EmptyState({
  tone = 'soft',
  icon,
  title,
  description,
  action,
  style,
}) {
  return (
    <View style={[styles.wrap, style]}>
      {icon ? (
        <IconBubble tone={tone} size="lg" style={{ marginBottom: spacing.lg }}>
          {icon}
        </IconBubble>
      ) : null}
      {title ? (
        <Text variant="h3" align="center" color={palette.slate[800]} style={{ marginBottom: 4 }}>
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text variant="body" align="center" color={palette.slate[500]} style={{ maxWidth: 260 }}>
          {description}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: spacing.lg }}>{action}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.lg,
  },
})
