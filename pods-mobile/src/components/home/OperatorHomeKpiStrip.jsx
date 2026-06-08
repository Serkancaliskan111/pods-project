import React, { useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import { ArrowUpRight } from 'lucide-react-native'
import {
  Text as KitText,
  Heading as KitHeading,
  IconBubble as KitIconBubble,
  Card as KitCard,
  palette as kitPalette,
  spacing as kitSpacing,
  radii as kitRadii,
  shadows as kitShadows,
  tones,
  Icon,
} from '../../ui'

const GRID_GAP = kitSpacing.sm

function KpiTile({ card, loading }) {
  const IconComp = card.IconComp
  const tone = tones[card.tone] || tones.soft
  const display = loading ? '−' : String(card.value)
  const isZero = !loading && Number(card.value) === 0

  return (
    <KitCard
      tone={card.tone}
      padding="sm"
      radius="xl"
      interactive={!!card.onPress}
      onPress={card.onPress}
      style={styles.tile}
      accessibilityRole={card.onPress ? 'button' : undefined}
      accessibilityLabel={`${card.label}: ${display}`}
    >
      <View style={styles.tileTop}>
        <KitIconBubble tone={card.tone} size="sm">
          <IconComp size={16} color={tone.icon} strokeWidth={2.2} />
        </KitIconBubble>
        {card.onPress ? <ArrowUpRight size={14} color={tone.softText} strokeWidth={2.4} /> : null}
      </View>

      <KitText
        variant="metricSm"
        weight="Bold"
        color={isZero ? kitPalette.slate[400] : tone.text}
        style={styles.tileValue}
      >
        {display}
      </KitText>

      <KitText variant="overline" weight="SemiBold" color={tone.softText} numberOfLines={1}>
        {card.shortLabel}
      </KitText>
    </KitCard>
  )
}

/** Personel ana sayfa KPI — yönetici `ManagerHomeKpiStrip` ile aynı kart düzeni. */
export default function OperatorHomeKpiStrip({
  loading,
  overdue = 0,
  today = 0,
  tomorrow = 0,
  urgent = 0,
  onPressOverdue,
  onPressToday,
  onPressTomorrow,
  onPressUrgent,
  style,
}) {
  const cards = useMemo(
    () => [
      {
        key: 'overdue',
        tone: 'danger',
        shortLabel: 'Gecikmiş',
        label: 'Gecikmiş görevler',
        value: overdue,
        IconComp: Icon.Warning,
        onPress: onPressOverdue,
      },
      {
        key: 'today',
        tone: 'primary',
        shortLabel: 'Bugün',
        label: 'Bugünkü görevler',
        value: today,
        IconComp: Icon.Tasks,
        onPress: onPressToday,
      },
      {
        key: 'tomorrow',
        tone: 'warning',
        shortLabel: 'Yarın',
        label: 'Yarınki görevler',
        value: tomorrow,
        IconComp: Icon.Calendar,
        onPress: onPressTomorrow,
      },
      {
        key: 'urgent',
        tone: 'accent',
        shortLabel: 'Acil',
        label: 'Acil görevler',
        value: urgent,
        IconComp: Icon.Urgent,
        onPress: onPressUrgent,
      },
    ],
    [overdue, today, tomorrow, urgent, onPressOverdue, onPressToday, onPressTomorrow, onPressUrgent],
  )

  return (
    <View style={[styles.shell, style]}>
      <View style={styles.header}>
        <KitIconBubble tone="primary" size="sm" square>
          <Icon.Tasks size={16} color={kitPalette.primary[700]} strokeWidth={2} />
        </KitIconBubble>
        <KitHeading variant="h3" color={kitPalette.slate[900]} style={styles.headerTitle}>
          Görev özeti
        </KitHeading>
      </View>

      <View style={styles.grid}>
        {cards.map((card) => (
          <View key={card.key} style={styles.gridCell}>
            <KpiTile card={card} loading={loading} />
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: kitPalette.surface,
    borderRadius: kitRadii['2xl'],
    borderWidth: 1,
    borderColor: kitPalette.slate[200],
    padding: kitSpacing.md,
    ...kitShadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.sm,
    marginBottom: kitSpacing.md,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -GRID_GAP / 2,
  },
  gridCell: {
    width: '50%',
    paddingHorizontal: GRID_GAP / 2,
    paddingBottom: GRID_GAP,
  },
  tile: {
    minHeight: 92,
  },
  tileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: kitSpacing.xs,
  },
  tileValue: {
    marginBottom: 2,
  },
})
