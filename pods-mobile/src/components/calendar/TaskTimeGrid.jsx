import React, { useMemo } from 'react'
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import {
  ALL_DAY_ROW_HEIGHT,
  CALENDAR_VIEW,
  getCalendarEventColors,
  getTimedEventStyle,
  GRID_END_HOUR,
  GRID_START_HOUR,
  HOUR_HEIGHT_PX,
  layoutOverlappingTimedEvents,
  partitionTasksForDay,
  formatEventTimeRange,
} from '../../lib/taskCalendarUtils'
import { Text, palette, spacing, radii } from '../../ui'

const TIME_COL_WIDTH = 52

function isToday(d) {
  const t = new Date()
  return (
    d.getDate() === t.getDate() &&
    d.getMonth() === t.getMonth() &&
    d.getFullYear() === t.getFullYear()
  )
}

function EventCard({ item, style, onOpen }) {
  const colors = getCalendarEventColors(item.task)
  const isAllDay = item.type === 'allday'
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onOpen?.(item.task)}
      style={[
        styles.eventCard,
        style,
        { backgroundColor: colors.bg, borderLeftColor: colors.border },
      ]}
    >
      {!isAllDay ? (
        <Text variant="caption" weight="SemiBold" color={colors.text} style={{ opacity: 0.8 }}>
          {formatEventTimeRange(item.segStart, item.segEnd)}
        </Text>
      ) : null}
      <Text variant="caption" weight="Bold" color={colors.text} numberOfLines={2}>
        {item.task.baslik || 'Görev'}
      </Text>
    </TouchableOpacity>
  )
}

function DayColumn({ day, tasks, isWeek, onOpenTask }) {
  const { allDay, timed } = useMemo(() => partitionTasksForDay(tasks, day), [tasks, day])
  const laidOut = useMemo(() => layoutOverlappingTimedEvents(timed), [timed])
  const gridHeight = (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT_PX
  const hours = useMemo(() => {
    const list = []
    for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h += 1) list.push(h)
    return list
  }, [])

  return (
    <View style={[styles.dayCol, isWeek && styles.dayColWeek]}>
      {isWeek ? (
        <View style={[styles.dayHeader, isToday(day) && styles.dayHeaderToday]}>
          <Text variant="caption" weight="Bold" color={isToday(day) ? palette.primary[700] : palette.slate[700]}>
            {day.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' })}
          </Text>
        </View>
      ) : null}

      <View style={[styles.allDayRow, { minHeight: ALL_DAY_ROW_HEIGHT }]}>
        {!isWeek ? (
          <View style={[styles.timeCol, { width: TIME_COL_WIDTH }]}>
            <Text variant="caption" weight="SemiBold" color={palette.slate[400]} style={styles.timeLabel}>
              Tüm gün
            </Text>
          </View>
        ) : null}
        <View style={styles.allDayBody}>
          {allDay.map((item) => {
            const c = getCalendarEventColors(item.task)
            return (
              <TouchableOpacity
                key={item.key}
                activeOpacity={0.85}
                onPress={() => onOpenTask?.(item.task)}
                style={[styles.allDayChip, { backgroundColor: c.bg, borderLeftColor: c.border }]}
              >
                <Text variant="caption" weight="Bold" color={c.text} numberOfLines={1}>
                  {item.task.baslik || 'Görev'}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      <ScrollView style={styles.gridScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        <View style={styles.gridRow}>
          <View style={[styles.timeCol, { width: isWeek ? 40 : TIME_COL_WIDTH }]}>
            {hours.map((h) => (
              <View key={h} style={{ height: HOUR_HEIGHT_PX }}>
                <Text variant="caption" color={palette.slate[400]} style={styles.hourLabel}>
                  {String(h).padStart(2, '0')}:00
                </Text>
              </View>
            ))}
          </View>
          <View style={[styles.gridBody, { height: gridHeight }]}>
            {hours.map((h) => (
              <View
                key={`line-${h}`}
                style={[styles.hourLine, { top: (h - GRID_START_HOUR) * HOUR_HEIGHT_PX }]}
              />
            ))}
            {laidOut.map((item) => {
              const pos = getTimedEventStyle(item, GRID_START_HOUR, HOUR_HEIGHT_PX)
              return (
                <EventCard
                  key={item.key}
                  item={item}
                  onOpen={onOpenTask}
                  style={{
                    position: 'absolute',
                    top: pos.top,
                    height: pos.height,
                    left: `${item.leftPct}%`,
                    width: `${item.widthPct - 2}%`,
                    marginLeft: 2,
                    zIndex: 2 + item.column,
                  }}
                />
              )
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

export default function TaskTimeGrid({ viewMode, days, tasks, loading, onOpenTask }) {
  const isWeek = viewMode === CALENDAR_VIEW.WEEK && days.length > 1
  const singleDay = days[0]

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.primary[700]} />
        <Text variant="bodySm" color={palette.slate[500]} style={{ marginTop: spacing.sm }}>
          Takvim yükleniyor…
        </Text>
      </View>
    )
  }

  if (!isWeek) {
    return (
      <View style={styles.wrap}>
        <View style={styles.singleHeader}>
          <Text variant="bodySm" weight="Bold" color={palette.slate[700]}>
            {singleDay ? singleDay.toLocaleDateString('tr-TR', { weekday: 'long' }) : '—'}
          </Text>
        </View>
        <DayColumn day={singleDay} tasks={tasks} isWeek={false} onOpenTask={onOpenTask} />
      </View>
    )
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.wrap}>
      <View style={styles.weekRow}>
        <View style={{ width: 40 }} />
        {days.map((day) => (
          <DayColumn
            key={day.toISOString()}
            day={day}
            tasks={tasks}
            isWeek
            onOpenTask={onOpenTask}
          />
        ))}
      </View>
    </ScrollView>
  )
}

const DAY_COL_WIDTH = 120

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  wrap: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.slate[200],
    overflow: 'hidden',
    backgroundColor: palette.surface,
  },
  singleHeader: {
    borderBottomWidth: 1,
    borderBottomColor: palette.slate[100],
    backgroundColor: palette.slate[50],
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCol: {
    flex: 1,
    minWidth: DAY_COL_WIDTH,
  },
  dayColWeek: {
    borderLeftWidth: 1,
    borderLeftColor: palette.slate[100],
  },
  dayHeader: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: palette.slate[200],
    backgroundColor: palette.slate[50],
  },
  dayHeaderToday: {
    backgroundColor: palette.primary[50],
  },
  allDayRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: palette.slate[200],
  },
  timeCol: {
    borderRightWidth: 1,
    borderRightColor: palette.slate[100],
    backgroundColor: palette.slate[50],
  },
  timeLabel: {
    textAlign: 'right',
    paddingRight: 4,
    paddingTop: spacing.sm,
  },
  allDayBody: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    padding: 4,
  },
  allDayChip: {
    borderLeftWidth: 3,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  gridScroll: {
    maxHeight: 420,
  },
  gridRow: {
    flexDirection: 'row',
  },
  hourLabel: {
    textAlign: 'right',
    paddingRight: 4,
    marginTop: -6,
  },
  gridBody: {
    flex: 1,
    position: 'relative',
    backgroundColor: palette.surface,
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.slate[100],
  },
  eventCard: {
    borderLeftWidth: 3,
    borderRadius: radii.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    overflow: 'hidden',
  },
})
