import React, { useMemo } from 'react'
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import {
  computeBarPlacement,
  getTaskBarColors,
} from '../../lib/taskCalendarUtils'
import { getTaskWorkStatusOption } from '../../lib/taskWorkStatus'
import { Text, palette, spacing, radii } from '../../ui'

const LABEL_WIDTH = 140
const DAY_MIN_WIDTH = 72
const ROW_H = 40
const PERSON_ROW_H = 36

function isToday(d) {
  const t = new Date()
  return (
    d.getDate() === t.getDate() &&
    d.getMonth() === t.getMonth() &&
    d.getFullYear() === t.getFullYear()
  )
}

export default function TaskGantt({
  days,
  rangeStart,
  rangeEnd,
  rows,
  loading,
  emptyMessage = 'Seçilen aralıkta görev bulunamadı.',
  labelHeader = 'Görev / Personel',
  onTaskClick,
  embedded = false,
}) {
  const gridWidth = Math.max(days.length * DAY_MIN_WIDTH, 280)

  const dayMarkers = useMemo(() => {
    const totalMs = Math.max(1, rangeEnd.getTime() - rangeStart.getTime() + 1)
    return days.map((d) => {
      const dayStart = new Date(d)
      dayStart.setHours(0, 0, 0, 0)
      const leftPct = ((dayStart.getTime() - rangeStart.getTime()) / totalMs) * 100
      return { date: d, leftPct: Math.max(0, Math.min(100, leftPct)) }
    })
  }, [days, rangeStart, rangeEnd])

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.primary[700]} />
        <Text variant="bodySm" color={palette.slate[500]} style={{ marginTop: spacing.sm }}>
          Gantt yükleniyor…
        </Text>
      </View>
    )
  }

  if (!rows.length) {
    return (
      <View style={[styles.empty, embedded && styles.emptyEmbedded]}>
        <Text variant="bodySm" color={palette.slate[500]}>
          {emptyMessage}
        </Text>
      </View>
    )
  }

  return (
    <View style={[!embedded && styles.wrap]}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ width: LABEL_WIDTH + gridWidth }}>
          <View style={styles.headerRow}>
            <View style={[styles.labelHeader, { width: LABEL_WIDTH }]}>
              <Text variant="overline" color={palette.slate[500]}>
                {labelHeader}
              </Text>
            </View>
            <View style={[styles.dayHeaderTrack, { width: gridWidth }]}>
              {dayMarkers.map(({ date, leftPct }) => (
                <View
                  key={date.toISOString()}
                  style={[
                    styles.dayMarker,
                    {
                      left: `${leftPct}%`,
                      width: `${100 / Math.max(1, days.length)}%`,
                      backgroundColor: isToday(date) ? 'rgba(91, 124, 255, 0.08)' : undefined,
                    },
                  ]}
                >
                  <Text variant="caption" color={palette.slate[400]}>
                    {date.toLocaleDateString('tr-TR', { weekday: 'short' })}
                  </Text>
                  <Text variant="caption" weight="Bold" color={palette.slate[800]}>
                    {date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {rows.map((row) => {
            if (row.kind === 'person') {
              return (
                <View key={row.id} style={[styles.personRow, { minHeight: PERSON_ROW_H }]}>
                  <View style={[styles.labelCell, { width: LABEL_WIDTH }]}>
                    <Text variant="caption" weight="Bold" color={palette.slate[700]} numberOfLines={1}>
                      {row.label}
                      <Text variant="caption" color={palette.slate[400]}> ({row.taskCount})</Text>
                    </Text>
                  </View>
                  <View style={{ width: gridWidth }} />
                </View>
              )
            }

            const task = row.task
            const placement = computeBarPlacement(task, rangeStart, rangeEnd, days)
            const colors = getTaskBarColors(task)
            const statusLabel = getTaskWorkStatusOption(task?.calisma_durumu).label

            return (
              <View key={row.id} style={[styles.taskRow, { minHeight: ROW_H }]}>
                <TouchableOpacity
                  style={[styles.labelCell, { width: LABEL_WIDTH, paddingLeft: row.indent ? 24 : 12 }]}
                  activeOpacity={0.85}
                  onPress={() => onTaskClick?.(task)}
                >
                  <View style={[styles.statusDot, { backgroundColor: colors.dot }]} />
                  <Text variant="caption" color={palette.slate[800]} numberOfLines={1} style={{ flex: 1 }}>
                    {row.label}
                  </Text>
                </TouchableOpacity>
                <View style={[styles.barTrack, { width: gridWidth }]}>
                  {dayMarkers.map(({ date, leftPct }) => (
                    <View
                      key={`grid-${row.id}-${date.toISOString()}`}
                      style={[
                        styles.gridLine,
                        {
                          left: `${leftPct}%`,
                          width: `${100 / Math.max(1, days.length)}%`,
                          backgroundColor: isToday(date) ? 'rgba(91, 124, 255, 0.04)' : undefined,
                        },
                      ]}
                    />
                  ))}
                  {placement ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => onTaskClick?.(task)}
                      style={[
                        styles.bar,
                        {
                          left: `${placement.leftPct}%`,
                          width: `${placement.widthPct}%`,
                          backgroundColor: colors.bg,
                          borderColor: `${colors.dot}33`,
                        },
                      ]}
                    >
                      <Text variant="caption" weight="SemiBold" color={colors.color} numberOfLines={1}>
                        {statusLabel}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}

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
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.slate[200],
    borderRadius: radii.xl,
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
    backgroundColor: palette.surface,
  },
  emptyEmbedded: {
    borderWidth: 0,
    borderTopWidth: 1,
    borderStyle: 'solid',
    borderRadius: 0,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: palette.slate[200],
    backgroundColor: palette.slate[50],
  },
  labelHeader: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRightWidth: 1,
    borderRightColor: palette.slate[200],
    justifyContent: 'center',
  },
  dayHeaderTrack: {
    height: 52,
    position: 'relative',
  },
  dayMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderLeftWidth: 1,
    borderLeftColor: palette.slate[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  personRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.slate[100],
    backgroundColor: palette.slate[50],
  },
  taskRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.slate[100],
  },
  labelCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRightWidth: 1,
    borderRightColor: palette.slate[200],
    backgroundColor: palette.surface,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  barTrack: {
    position: 'relative',
    minHeight: ROW_H,
  },
  gridLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: palette.slate[100],
  },
  bar: {
    position: 'absolute',
    top: '25%',
    height: '50%',
    minWidth: 24,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.xs,
    justifyContent: 'center',
  },
})
