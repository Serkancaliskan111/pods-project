import React, { useMemo, useState } from 'react'
import { View, StyleSheet, TouchableOpacity } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { AlertTriangle, ChevronDown, ChevronRight, Clock } from 'lucide-react-native'
import {
  Text as KitText,
  palette as kitPalette,
  spacing as kitSpacing,
  radii as kitRadii,
  cubicle,
} from '../../ui'
import {
  formatUrgentTaskTimelineLabel,
  getUrgentTimelineAxisLabels,
  isCubicleHomeOverdueTask,
  spreadUrgentTimelineLanes,
  urgentTaskTimelineProgress,
} from '../../lib/cubicleHomeTaskBuckets'

function clampTimelineProgress(pct) {
  if (pct == null || Number.isNaN(pct)) return 50
  return Math.min(98, Math.max(2, pct))
}

export default function UrgentTasksPanel({
  tasks = [],
  loading,
  now = new Date(),
  onOpenTask,
  style,
}) {
  const count = tasks?.length || 0
  const [open, setOpen] = useState(true)

  const axisLabels = useMemo(() => getUrgentTimelineAxisLabels(now), [now])

  const timeline = useMemo(() => {
    const base = (tasks || []).map((task) => ({
      task,
      timeLabel: formatUrgentTaskTimelineLabel(task, now),
      progress: clampTimelineProgress(urgentTaskTimelineProgress(task, now)),
      overdue: isCubicleHomeOverdueTask(task, now),
    }))
    return spreadUrgentTimelineLanes(base)
  }, [tasks, now])

  const listItems = useMemo(
    () =>
      (tasks || []).map((task) => ({
        task,
        timeLabel: formatUrgentTaskTimelineLabel(task, now),
        overdue: isCubicleHomeOverdueTask(task, now),
      })),
    [tasks, now],
  )

  if (!loading && count === 0) {
    return null
  }

  const trackHeight = Math.max(6, 6 + Math.max(0, ...timeline.map((t) => t.lane || 0)) * 10)

  return (
    <View style={[styles.shell, style]}>
      <TouchableOpacity activeOpacity={0.9} onPress={() => setOpen((v) => !v)}>
        <LinearGradient
          colors={[cubicle.urgentBar, cubicle.urgentBarDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerIcon}>
            <AlertTriangle size={16} color={kitPalette.surface} strokeWidth={2.2} />
          </View>
          <View style={styles.headerCopy}>
            <KitText variant="bodySm" weight="Bold" color={kitPalette.surface}>
              Acil Görevler ({loading ? '…' : count})
            </KitText>
            <KitText variant="caption" color="rgba(255,255,255,0.82)">
              Son 7 gün · atanan aktif acil görevler
            </KitText>
          </View>
          <View style={styles.headerRight}>
            {!loading && count > 0 ? (
              <View style={styles.countBadge}>
                <KitText variant="caption" weight="Bold" color={cubicle.urgentBarDark}>
                  {count}
                </KitText>
              </View>
            ) : null}
            {open ? (
              <ChevronDown size={18} color={kitPalette.surface} strokeWidth={2.5} />
            ) : (
              <ChevronRight size={18} color={kitPalette.surface} strokeWidth={2.5} />
            )}
          </View>
        </LinearGradient>
      </TouchableOpacity>

      {open ? (
        <View style={styles.body}>
          {loading ? (
            <KitText variant="caption" color={kitPalette.slate[500]} style={styles.center}>
              Yükleniyor…
            </KitText>
          ) : null}

          {!loading && count === 0 ? (
            <View style={styles.empty}>
              <KitText variant="caption" color={cubicle.urgentBarDark}>
                Son 7 günde acil görev yok.
              </KitText>
            </View>
          ) : null}

          {!loading && count > 0 ? (
            <>
              <View style={styles.timelineWrap}>
                <View style={styles.timelineLabelRow}>
                  <Clock size={11} color={cubicle.urgentBarDark} strokeWidth={2.5} />
                  <KitText variant="overline" color={cubicle.urgentBarDark} weight="Bold">
                    Çizelge · son 7 gün
                  </KitText>
                </View>
                <View style={[styles.timelineTrack, { height: trackHeight }]}>
                  {timeline.map(({ task, progress, overdue, lane }) => (
                    <TouchableOpacity
                      key={task.id}
                      style={[
                        styles.timelineDot,
                        {
                          left: `${progress}%`,
                          top: '50%',
                          marginTop: -6 + (lane || 0) * 10,
                          transform: [{ translateX: -6 }],
                        },
                      ]}
                      onPress={() => onOpenTask?.(task)}
                      hitSlop={8}
                      accessibilityLabel={task.baslik || 'Acil görev'}
                    >
                      <View
                        style={[
                          styles.dot,
                          overdue ? styles.dotOverdue : styles.dotActive,
                        ]}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.timelineAxis}>
                  {axisLabels.map((tick) => (
                    <KitText
                      key={tick.key}
                      variant="caption"
                      color="rgba(185,28,28,0.65)"
                      numberOfLines={1}
                      style={tick.key === 'mid' ? styles.axisMid : styles.axisEdge}
                    >
                      {tick.label}
                    </KitText>
                  ))}
                </View>
              </View>

              <View style={styles.list}>
                {listItems.map(({ task, overdue, timeLabel }) => (
                  <TouchableOpacity
                    key={task.id}
                    activeOpacity={0.85}
                    onPress={() => onOpenTask?.(task)}
                    style={[styles.listRow, overdue && styles.listRowOverdue]}
                  >
                    <KitText
                      variant="caption"
                      weight="Bold"
                      color={overdue ? cubicle.urgentBarDark : cubicle.urgentBar}
                      style={styles.timeCol}
                      numberOfLines={2}
                    >
                      {timeLabel}
                    </KitText>
                    <KitText
                      variant="caption"
                      weight="SemiBold"
                      color={kitPalette.slate[800]}
                      numberOfLines={1}
                      style={styles.titleCol}
                    >
                      {task.baslik || 'Görev'}
                    </KitText>
                    <View style={styles.acilBadge}>
                      <KitText variant="overline" weight="Bold" color={kitPalette.surface}>
                        ACİL
                      </KitText>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: kitRadii.xl,
    borderWidth: 1,
    borderColor: cubicle.urgentBar,
    backgroundColor: kitPalette.surface,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: kitSpacing.md,
    paddingVertical: kitSpacing.sm + 2,
    gap: kitSpacing.sm,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: kitRadii.lg,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.xs,
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: kitPalette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  body: {
    borderTopWidth: 1,
    borderTopColor: cubicle.urgentGlow,
  },
  center: {
    textAlign: 'center',
    paddingVertical: kitSpacing.lg,
  },
  empty: {
    margin: kitSpacing.md,
    paddingVertical: kitSpacing.lg,
    borderRadius: kitRadii.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#FECACA',
    backgroundColor: 'rgba(254,226,226,0.6)',
    alignItems: 'center',
  },
  timelineWrap: {
    paddingHorizontal: kitSpacing.md,
    paddingTop: kitSpacing.sm,
    paddingBottom: kitSpacing.xs,
    backgroundColor: cubicle.urgentGlow,
    borderBottomWidth: 1,
    borderBottomColor: cubicle.urgentGlow,
  },
  timelineLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: kitSpacing.xs,
  },
  timelineTrack: {
    borderRadius: kitRadii.pill,
    backgroundColor: '#FECACA',
    position: 'relative',
    marginBottom: 4,
    minHeight: 6,
  },
  timelineDot: {
    position: 'absolute',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: kitPalette.surface,
  },
  dotActive: {
    backgroundColor: cubicle.urgentBar,
  },
  dotOverdue: {
    backgroundColor: cubicle.urgentBarDark,
  },
  timelineAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  axisEdge: {
    maxWidth: '32%',
  },
  axisMid: {
    maxWidth: '34%',
    textAlign: 'center',
  },
  list: {
    padding: kitSpacing.sm,
    gap: kitSpacing.xs,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.sm,
    paddingHorizontal: kitSpacing.sm,
    paddingVertical: kitSpacing.sm,
    borderRadius: kitRadii.lg,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: kitPalette.surface,
  },
  listRowOverdue: {
    borderColor: '#FCA5A5',
    backgroundColor: 'rgba(254,226,226,0.5)',
  },
  timeCol: {
    width: 72,
    textAlign: 'center',
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
  },
  acilBadge: {
    backgroundColor: cubicle.urgentBar,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
})
