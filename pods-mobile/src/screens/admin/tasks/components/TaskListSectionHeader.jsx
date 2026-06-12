import React from 'react'
import { TouchableOpacity, StyleSheet } from 'react-native'
import { ChevronDown, ChevronRight } from 'lucide-react-native'
import { Text, spacing, radii } from '../../../../ui'
import { TASK_SECTION_COLORS } from '../lib/tasksListTheme'

export { TASK_SECTION_COLORS as SECTION_COLORS }

export function TaskListSectionHeader({ label, count, color, open, onToggle, subtitle }) {
  const accent = color || TASK_SECTION_COLORS.today

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onToggle}
      style={[styles.wrap, { backgroundColor: accent }, open && styles.wrapOpen]}
    >
      <Text variant="bodySm" weight="Bold" color="#FFFFFF" style={styles.title}>
        {label} ({count})
      </Text>
      {subtitle ? (
        <Text variant="caption" color="rgba(255,255,255,0.88)" numberOfLines={1} style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
      {open ? (
        <ChevronDown
          size={18}
          color="#FFFFFF"
          strokeWidth={2.2}
          style={[styles.chevron, subtitle ? styles.chevronWithSubtitle : null]}
        />
      ) : (
        <ChevronRight
          size={18}
          color="#FFFFFF"
          strokeWidth={2.2}
          style={[styles.chevron, subtitle ? styles.chevronWithSubtitle : null]}
        />
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: spacing.xs,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  wrapOpen: {
    marginBottom: spacing.sm,
  },
  title: {
    paddingRight: 28,
  },
  subtitle: {
    marginTop: 2,
    paddingRight: 28,
  },
  chevron: {
    position: 'absolute',
    right: spacing.md,
    top: '50%',
    marginTop: -9,
  },
  chevronWithSubtitle: {
    marginTop: -8,
  },
})
