import React, { useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import {
  formatCalendarDayHeader,
  formatEventTimeRange,
  getCalendarEventColors,
  partitionTasksForDay,
} from '../../lib/taskCalendarUtils'
import { Text, palette, spacing, radii } from '../../ui'

export default function TaskDayAgenda({ day, tasks, loading, onOpenTask, compactHeader = false }) {
  const items = useMemo(() => {
    if (!day) return []
    const { allDay, timed } = partitionTasksForDay(tasks, day)
    return [...allDay, ...timed]
  }, [day, tasks])

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.primary[700]} />
      </View>
    )
  }

  const header = day ? formatCalendarDayHeader(day, false) : '—'

  return (
    <View style={styles.wrap}>
      {!compactHeader ? (
        <View style={styles.header}>
          <Text variant="bodySm" weight="Bold" color={palette.slate[800]}>
            {header}
          </Text>
          <Text variant="caption" color={palette.slate[500]}>
            {items.length} görev
          </Text>
        </View>
      ) : null}

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="bodySm" color={palette.slate[500]}>
            Bu gün için görev yok.
          </Text>
        </View>
      ) : (
        items.map((item) => {
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
              <View style={[styles.accent, { backgroundColor: colors.border }]} />
              <View style={styles.timeCol}>
                <Text variant="caption" weight="Bold" color={palette.slate[700]}>
                  {timeLabel}
                </Text>
              </View>
              <View style={[styles.card, { backgroundColor: colors.bg }]}>
                <Text variant="bodySm" weight="SemiBold" color={colors.text} numberOfLines={2}>
                  {item.task.baslik || 'Görev'}
                </Text>
              </View>
            </TouchableOpacity>
          )
        })
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: palette.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  loading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  empty: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    gap: spacing.sm,
  },
  accent: {
    width: 4,
    borderRadius: 2,
    marginVertical: 2,
  },
  timeCol: {
    width: 64,
    justifyContent: 'center',
  },
  card: {
    flex: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
})
