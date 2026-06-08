import React, { useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import {
  buildMonthGridCells,
  getCalendarEventColors,
  startOfDay,
  tasksOnCalendarDay,
} from '../../lib/taskCalendarUtils'
import { Text, palette, spacing } from '../../ui'

const WEEKDAYS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz']
const CELL_FLEX = 1 / 7

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

/** Kompakt ay ızgarası — nokta göstergeleri (telefon takvimi tarzı) */
export default function TaskMonthGrid({
  anchorDate,
  selectedDate,
  tasks,
  loading,
  onSelectDay,
}) {
  const cells = useMemo(() => buildMonthGridCells(anchorDate), [anchorDate])

  const rows = useMemo(() => {
    const out = []
    for (let i = 0; i < cells.length; i += 7) {
      out.push(cells.slice(i, i + 7))
    }
    return out
  }, [cells])

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.primary[700]} />
      </View>
    )
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, idx) => (
          <View key={`${w}-${idx}`} style={styles.weekCell}>
            <Text variant="caption" weight="Bold" color={palette.slate[400]}>
              {w}
            </Text>
          </View>
        ))}
      </View>
      {rows.map((week, rowIdx) => (
        <View key={`row-${rowIdx}`} style={styles.weekLine}>
          {week.map(({ date, outside }) => {
            const dayTasks = tasksOnCalendarDay(tasks, date)
            const today = isToday(date)
            const selected = sameDay(date, selectedDate)
            return (
              <TouchableOpacity
                key={date.toISOString()}
                style={styles.cell}
                activeOpacity={0.7}
                onPress={() => onSelectDay?.(startOfDay(date))}
              >
                <View
                  style={[
                    styles.dayBubble,
                    today && styles.dayBubbleToday,
                    selected && styles.dayBubbleSelected,
                  ]}
                >
                  <Text
                    variant="bodySm"
                    weight={selected || today ? 'Bold' : 'SemiBold'}
                    color={
                      selected
                        ? palette.surface
                        : outside
                          ? palette.slate[300]
                          : today
                            ? palette.primary[700]
                            : palette.slate[800]
                    }
                  >
                    {date.getDate()}
                  </Text>
                </View>
                <View style={styles.dots}>
                  {dayTasks.slice(0, 3).map((task, i) => {
                    const c = getCalendarEventColors(task)
                    return (
                      <View
                        key={`${task.id}-${i}`}
                        style={[styles.dot, { backgroundColor: c.border }]}
                      />
                    )
                  })}
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
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  wrap: {
    backgroundColor: palette.surface,
    paddingBottom: spacing.xs,
  },
  weekRow: {
    flexDirection: 'row',
    paddingBottom: spacing.xs,
  },
  weekCell: {
    flex: CELL_FLEX,
    alignItems: 'center',
  },
  weekLine: {
    flexDirection: 'row',
  },
  cell: {
    flex: CELL_FLEX,
    alignItems: 'center',
    paddingVertical: 4,
    minHeight: 48,
  },
  dayBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBubbleToday: {
    backgroundColor: palette.primary[50],
  },
  dayBubbleSelected: {
    backgroundColor: palette.primary[600],
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 3,
    height: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
})
