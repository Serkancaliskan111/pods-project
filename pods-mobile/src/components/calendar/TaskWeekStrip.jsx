import React, { useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { startOfWeekMonday, addDays } from '../../lib/taskCalendarUtils'
import { Text, palette, spacing, radii } from '../../ui'

function sameDay(a, b) {
  if (!a || !b) return false
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isToday(d) {
  return sameDay(d, new Date())
}

/** iOS / Google Calendar tarzı yatay hafta şeridi */
export default function TaskWeekStrip({ anchorDate, onSelectDay }) {
  const days = useMemo(() => {
    const start = startOfWeekMonday(anchorDate)
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [anchorDate])

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {days.map((day) => {
        const selected = sameDay(day, anchorDate)
        const today = isToday(day)
        const weekday = day.toLocaleDateString('tr-TR', { weekday: 'short' }).replace('.', '')
        return (
          <TouchableOpacity
            key={day.toISOString()}
            style={[styles.chip, selected && styles.chipSelected]}
            activeOpacity={0.85}
            onPress={() => onSelectDay?.(day)}
          >
            <Text
              variant="caption"
              weight="SemiBold"
              color={selected ? palette.surface : palette.slate[500]}
              style={styles.weekday}
            >
              {weekday}
            </Text>
            <View style={[styles.dayBubble, today && !selected && styles.dayBubbleToday]}>
              <Text
                variant="bodySm"
                weight="Bold"
                color={selected ? palette.surface : today ? palette.primary[700] : palette.slate[800]}
              >
                {day.getDate()}
              </Text>
            </View>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  chip: {
    alignItems: 'center',
    minWidth: 44,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radii.lg,
  },
  chipSelected: {
    backgroundColor: palette.primary[600],
  },
  weekday: {
    textTransform: 'capitalize',
    marginBottom: 4,
  },
  dayBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBubbleToday: {
    backgroundColor: palette.primary[50],
  },
})
