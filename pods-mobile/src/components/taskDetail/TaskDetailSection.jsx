import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text, palette, spacing, radii } from '../../ui'
import { TaskDetailSectionLabel } from './TaskDetailTypeHero'

/**
 * Görev detay bölüm kartı — ana sayfa KitCard ile aynı dil.
 */
export default function TaskDetailSection({
  children,
  design,
  label,
  accentStyle,
  style,
  flush,
}) {
  return (
    <View
      style={[
        styles.wrap,
        accentStyle,
        flush && styles.flush,
        style,
      ]}
    >
      {label ? <TaskDetailSectionLabel design={design} label={label} /> : null}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: palette.surface,
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: palette.slate[200],
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  flush: {
    padding: 0,
    overflow: 'hidden',
  },
})
