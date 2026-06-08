import React, { useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import {
  formatCalendarDayHeader,
  formatEventTimeRange,
  getCalendarEventColors,
  partitionTasksForDay,
} from '../../lib/taskCalendarUtils'
import { Text, palette, spacing, radii } from '../../ui'

export default function TaskCalendarList({ days, tasks, loading, onOpenTask }) {
  const sections = useMemo(() => {
    const out = []
    for (const day of days || []) {
      const { allDay, timed } = partitionTasksForDay(tasks, day)
      const items = [...allDay, ...timed]
      if (!items.length) continue
      out.push({ day, items })
    }
    return out
  }, [days, tasks])

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.primary[700]} />
        <Text variant="bodySm" color={palette.slate[500]} style={{ marginTop: spacing.sm }}>
          Yükleniyor…
        </Text>
      </View>
    )
  }

  if (!sections.length) {
    return (
      <View style={styles.empty}>
        <Text variant="bodySm" color={palette.slate[500]}>
          Bu dönemde görev yok.
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.wrap}>
      {sections.map(({ day, items }) => (
        <View key={day.toISOString()}>
          <View style={styles.sectionHeader}>
            <Text variant="caption" weight="Bold" color={palette.slate[600]}>
              {formatCalendarDayHeader(day, true)}
            </Text>
          </View>
          {items.map((item) => {
            const colors = getCalendarEventColors(item.task)
            const timeLabel =
              item.type === 'allday' ? 'Tüm gün' : formatEventTimeRange(item.segStart, item.segEnd)
            return (
              <TouchableOpacity
                key={item.key}
                style={styles.row}
                activeOpacity={0.85}
                onPress={() => onOpenTask?.(item.task)}
              >
                <View style={[styles.bar, { backgroundColor: colors.border }]} />
                <View style={styles.rowBody}>
                  <Text variant="caption" weight="SemiBold" color={palette.slate[500]}>
                    {timeLabel}
                  </Text>
                  <Text variant="bodySm" weight="SemiBold" color={palette.slate[900]} numberOfLines={2}>
                    {item.task.baslik || 'Görev'}
                  </Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  empty: {
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
  },
  wrap: {
    paddingBottom: spacing.sm,
  },
  sectionHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: palette.slate[50],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.slate[100],
    minHeight: 52,
  },
  bar: {
    width: 4,
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  rowBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
})
