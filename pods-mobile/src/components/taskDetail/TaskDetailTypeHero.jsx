import React from 'react'
import { View, StyleSheet } from 'react-native'
import HomeCompactGreeting from '../home/HomeCompactGreeting'
import { Text, Icon as KitIcon, palette, spacing } from '../../ui'

export default function TaskDetailTypeHero({
  design,
  title,
  subtitle,
  statusLabel,
  isDone,
  urgent,
}) {
  const accent = design?.accent || palette.primary[600]

  return (
    <HomeCompactGreeting
      eyebrow={design?.label || 'Görev'}
      title={title}
      subtitle={subtitle || design?.sub}
      accentColor={accent}
      style={styles.hero}
      actions={
        <View style={styles.chips}>
          <View style={[styles.chip, isDone ? styles.chipDone : styles.chipNeutral]}>
            {isDone ? <KitIcon.Delivered size={11} color={palette.success[700]} strokeWidth={3} /> : null}
            <Text variant="caption" weight="SemiBold" color={isDone ? palette.success[800] : palette.slate[700]}>
              {statusLabel}
            </Text>
          </View>
          {urgent ? (
            <View style={[styles.chip, styles.chipUrgent]}>
              <KitIcon.Urgent size={11} color={palette.danger[700]} strokeWidth={2.2} />
              <Text variant="caption" weight="Bold" color={palette.danger[700]}>
                Acil
              </Text>
            </View>
          ) : null}
        </View>
      }
    />
  )
}

export function TaskDetailSectionLabel({ design, label }) {
  const accent = design?.accent || palette.primary[600]
  return (
    <View style={styles.sectionLabelRow}>
      <View style={[styles.sectionAccent, { backgroundColor: accent }]} />
      <Text variant="overline" weight="Bold" color={palette.slate[600]}>
        {label || design?.mainLabel || 'Detay'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  hero: {
    marginBottom: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipNeutral: {
    backgroundColor: palette.slate[50],
    borderColor: palette.slate[200],
  },
  chipDone: {
    backgroundColor: palette.success[50],
    borderColor: palette.success[200],
  },
  chipUrgent: {
    backgroundColor: palette.danger[50],
    borderColor: palette.danger[200],
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  sectionAccent: {
    width: 3,
    height: 14,
    borderRadius: 2,
  },
})
