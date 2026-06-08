import React from 'react'
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { Text, palette, spacing, radii, shadows } from '../../ui'
import { resolveEmbeddedStepIcon } from '../../hooks/useTaskAssignEmbeddedSteps'

/**
 * Web task-assign-embedded tab bar — ana sayfa kart stili.
 */
export default function TaskAssignEmbeddedNav({
  steps = [],
  activeIndex = 0,
  onSelect,
}) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {steps.map((tab, idx) => {
          const Icon = resolveEmbeddedStepIcon(tab.icon)
          const active = idx === activeIndex
          const done = idx < activeIndex
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, active && styles.tabActive, done && !active && styles.tabDone]}
              onPress={() => done && onSelect?.(idx)}
              disabled={!done}
              activeOpacity={0.85}
            >
              <View style={[styles.iconBox, active && styles.iconBoxActive, done && !active && styles.iconBoxDone]}>
                <Icon
                  size={15}
                  color={active ? palette.primary[700] : done ? palette.primary[600] : palette.slate[400]}
                  strokeWidth={2.2}
                />
              </View>
              <Text
                variant="caption"
                weight="Bold"
                color={active ? palette.primary[800] : done ? palette.primary[700] : palette.slate[400]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
              {active ? <View style={styles.activeDot} /> : null}
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: palette.slate[50],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.slate[200],
  },
  scroll: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  tab: {
    minWidth: 76,
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.xl,
  },
  tabActive: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.primary[200],
    ...shadows.sm,
  },
  tabDone: {
    opacity: 1,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.slate[100],
  },
  iconBoxActive: {
    backgroundColor: palette.primary[50],
    borderWidth: 1,
    borderColor: palette.primary[100],
  },
  iconBoxDone: {
    backgroundColor: palette.primary[50],
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.primary[700],
    marginTop: 1,
  },
})
