import React, { useMemo, useState } from 'react'
import { View, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native'
import { ArrowUpRight, ChevronDown } from 'lucide-react-native'
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
import {
  MANAGER_KPI_DATE_FILTERS,
  labelForManagerKpiDateFilter,
} from '../../lib/managerHomeKpis'

const GRID_GAP = kitSpacing.sm

function DateFilterDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const label = labelForManagerKpiDateFilter(value)

  return (
    <>
      <TouchableOpacity
        style={styles.scopeBtn}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Tarih aralığı: ${label}`}
      >
        <KitText variant="caption" weight="SemiBold" color={kitPalette.slate[700]} numberOfLines={1}>
          {label}
        </KitText>
        <ChevronDown size={14} color={kitPalette.slate[500]} strokeWidth={2.2} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)} />
        <View style={styles.modalSheet}>
          <KitHeading variant="h3" style={{ marginBottom: kitSpacing.md }}>
            Tarih aralığı
          </KitHeading>
          {MANAGER_KPI_DATE_FILTERS.map((opt) => {
            const active = opt.key === value
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.scopeOption, active && styles.scopeOptionActive]}
                onPress={() => {
                  onChange?.(opt.key)
                  setOpen(false)
                }}
              >
                <KitText
                  variant="bodySm"
                  weight={active ? 'Bold' : 'Medium'}
                  color={active ? kitPalette.primary[700] : kitPalette.slate[700]}
                >
                  {opt.label}
                </KitText>
              </TouchableOpacity>
            )
          })}
        </View>
      </Modal>
    </>
  )
}

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
      interactive
      onPress={card.onPress}
      style={styles.tile}
      accessibilityRole="button"
      accessibilityLabel={`${card.label}: ${display}`}
    >
      <View style={styles.tileTop}>
        <KitIconBubble tone={card.tone} size="sm">
          <IconComp size={16} color={tone.icon} strokeWidth={2.2} />
        </KitIconBubble>
        <ArrowUpRight size={14} color={tone.softText} strokeWidth={2.4} />
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

export default function ManagerHomeKpiStrip({
  loading,
  kpis,
  dateFilter,
  onDateFilterChange,
  onPressPending,
  onPressOverdue,
  onPressCompleted,
  onPressAll,
  style,
}) {
  const cards = useMemo(
    () => [
      {
        key: 'pending',
        tone: 'warning',
        shortLabel: 'Bekleyen',
        label: 'Bekleyen görevler',
        value: kpis?.pending ?? 0,
        IconComp: Icon.Clock,
        onPress: onPressPending,
      },
      {
        key: 'overdue',
        tone: 'danger',
        shortLabel: 'Geciken',
        label: 'Geciken görevler',
        value: kpis?.overdue ?? 0,
        IconComp: Icon.Warning,
        onPress: onPressOverdue,
      },
      {
        key: 'completed',
        tone: 'success',
        shortLabel: 'Tamamlanan',
        label: 'Tamamlanan görevler',
        value: kpis?.completed ?? 0,
        IconComp: Icon.TaskComplete,
        onPress: onPressCompleted,
      },
      {
        key: 'all',
        tone: 'primary',
        shortLabel: 'Tümü',
        label: 'Tüm görevler',
        value: kpis?.totalTasks ?? 0,
        IconComp: Icon.Tasks,
        onPress: onPressAll,
      },
    ],
    [kpis, onPressPending, onPressOverdue, onPressCompleted, onPressAll],
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
        <DateFilterDropdown value={dateFilter} onChange={onDateFilterChange} />
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
  scopeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 118,
    paddingHorizontal: kitSpacing.sm,
    paddingVertical: kitSpacing.xs,
    borderRadius: kitRadii.lg,
    backgroundColor: kitPalette.slate[50],
    borderWidth: 1,
    borderColor: kitPalette.slate[200],
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
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  modalSheet: {
    position: 'absolute',
    left: kitSpacing.lg,
    right: kitSpacing.lg,
    bottom: kitSpacing['2xl'],
    backgroundColor: kitPalette.surface,
    borderRadius: kitRadii['2xl'],
    padding: kitSpacing.lg,
    ...kitShadows.lg,
  },
  scopeOption: {
    paddingVertical: kitSpacing.md,
    paddingHorizontal: kitSpacing.sm,
    borderRadius: kitRadii.lg,
  },
  scopeOptionActive: {
    backgroundColor: kitPalette.primary[50],
  },
})
