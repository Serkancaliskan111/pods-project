import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text, Icon, palette, spacing, radii, shadows } from '../../ui'

/**
 * Görev tipine göre KPI şeridi — ana sayfa ManagerHomeKpiStrip ile uyumlu kart.
 */
export default function TaskDetailTypeStats({ design, stats }) {
  if (!stats?.items?.length) return null
  const accent = design?.accent || palette.primary[600]

  return (
    <View style={styles.wrap}>
      {stats.items.map((item) => {
        const ItemIcon = item.Icon
        const toneStyle =
          item.tone === 'success'
            ? styles.chipSuccess
            : item.tone === 'warn'
              ? styles.chipWarn
              : item.tone === 'accent'
                ? { borderColor: `${accent}55`, backgroundColor: `${accent}12` }
                : styles.chipNeutral

        return (
          <View key={item.label} style={[styles.chip, toneStyle]}>
            {ItemIcon ? (
              <ItemIcon
                size={14}
                color={
                  item.tone === 'success'
                    ? palette.success[700]
                    : item.tone === 'warn'
                      ? palette.warning[700]
                      : accent
                }
                strokeWidth={2.2}
              />
            ) : null}
            <Text variant="bodySm" weight="Bold" color={palette.slate[900]}>
              {item.value}
            </Text>
            <Text variant="caption" color={palette.slate[500]} numberOfLines={1}>
              {item.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: palette.slate[200],
    padding: spacing.sm,
    ...shadows.sm,
  },
  chip: {
    flex: 1,
    minWidth: 0,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  chipNeutral: {
    backgroundColor: palette.slate[50],
    borderColor: palette.slate[200],
  },
  chipSuccess: {
    backgroundColor: palette.success[50],
    borderColor: palette.success[200],
  },
  chipWarn: {
    backgroundColor: palette.warning[50],
    borderColor: palette.warning[200],
  },
})
