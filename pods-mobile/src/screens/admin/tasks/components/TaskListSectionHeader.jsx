import React from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { ChevronDown, ChevronRight } from 'lucide-react-native'
import { Text, palette, spacing, radii } from '../../../../ui'

export const SECTION_COLORS = {
  today: '#F97316',
  tomorrow: '#3B82F6',
  yesterday: '#8B5CF6',
  week: '#6366F1',
  last7: '#6366F1',
  other: '#64748B',
}

export function TaskListSectionHeader({ label, count, color, open, onToggle, subtitle }) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onToggle}
      style={[styles.wrap, open && styles.wrapOpen]}
    >
      <View style={[styles.dot, { backgroundColor: color || SECTION_COLORS.today }]} />
      <View style={styles.textCol}>
        <View style={styles.titleRow}>
          <Text variant="bodySm" weight="Bold" color={palette.slate[800]}>
            {label}
          </Text>
          <View style={[styles.countBadge, { backgroundColor: `${color || SECTION_COLORS.today}18` }]}>
            <Text variant="caption" weight="Bold" color={color || SECTION_COLORS.today}>
              {count}
            </Text>
          </View>
        </View>
        {subtitle ? (
          <Text variant="caption" color={palette.slate[500]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {open ? (
        <ChevronDown size={18} color={palette.slate[400]} strokeWidth={2.2} />
      ) : (
        <ChevronRight size={18} color={palette.slate[400]} strokeWidth={2.2} />
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.slate[100],
  },
  wrapOpen: {
    borderColor: palette.slate[200],
    marginBottom: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countBadge: {
    minWidth: 26,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
