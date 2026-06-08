import React from 'react'
import { View, StyleSheet } from 'react-native'
import { ChevronRight, Link2, AlertTriangle } from 'lucide-react-native'
import { Text, Card, palette, spacing, radii } from '../../ui'
import { getProjectTaskStatusOption } from '../../lib/projectStatus'
import { isProjectTaskOverdue, formatProjectDateLabel } from '../../lib/projectGanttUtils'
import {
  getProjectTaskProgressLabel,
  getProjectTaskProgressPct,
} from '../../lib/projectTasksListUtils'
import { getProjectTaskTypeLabel } from '../../lib/projectTaskPodsAdapter'

export default function ProjectShowTaskCard({ task, assigneeName, onPress }) {
  const st = getProjectTaskStatusOption(task?.durum)
  const overdue = isProjectTaskOverdue(task)
  const linked = !!task?.bagli_is_id
  const barColor = overdue ? palette.danger[500] : st.color
  const progressPct = getProjectTaskProgressPct(task)
  const progressLabel = getProjectTaskProgressLabel(task)
  const endLabel = task?.bitis_tarihi ? formatProjectDateLabel(task.bitis_tarihi) : null
  const typeLabel = getProjectTaskTypeLabel(task?.gorev_tipi)

  return (
    <Card tone="surface" elevated padding="none" onPress={onPress} style={styles.card}>
      <View style={[styles.bar, { backgroundColor: barColor }]} />
      <View style={styles.body}>
        <View style={styles.head}>
          <View style={styles.titleCol}>
            <Text variant="bodyMd" weight="SemiBold" color={palette.slate[800]} numberOfLines={2}>
              {task?.baslik || 'Görev'}
            </Text>
            {assigneeName ? (
              <Text variant="caption" color={palette.slate[500]} style={{ marginTop: 2 }}>
                {assigneeName}
              </Text>
            ) : null}
          </View>
          <ChevronRight size={18} color={palette.slate[400]} strokeWidth={2} />
        </View>

        <View style={styles.tagRow}>
          <View style={[styles.tag, { backgroundColor: st.bg }]}>
            <Text variant="caption" weight="SemiBold" style={{ color: st.color, fontSize: 11 }}>
              {linked && task?._operational_only ? 'Operasyonel' : String(st.label || 'Görev')}
            </Text>
          </View>
          {task?.acil ? (
            <View style={[styles.tag, styles.urgentTag]}>
              <AlertTriangle size={11} color={palette.danger[700]} strokeWidth={2.2} />
              <Text variant="caption" weight="Bold" color={palette.danger[700]} style={{ fontSize: 11 }}>
                Acil
              </Text>
            </View>
          ) : null}
          {endLabel ? (
            <View style={styles.tagNeutral}>
              <Text variant="caption" color={palette.slate[600]} style={{ fontSize: 11 }}>
                {endLabel}
              </Text>
            </View>
          ) : null}
          {typeLabel ? (
            <View style={styles.tagNeutral}>
              <Text variant="caption" color={palette.slate[600]} style={{ fontSize: 11 }}>
                {typeLabel}
              </Text>
            </View>
          ) : null}
        </View>

        {progressLabel ? (
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: barColor }]}
              />
            </View>
            <Text variant="caption" color={palette.slate[500]} style={{ fontSize: 11 }}>
              {progressLabel}
            </Text>
          </View>
        ) : null}

        {linked ? (
          <View style={styles.linkedRow}>
            <Link2 size={12} color={palette.success[700]} strokeWidth={2.2} />
            <Text variant="caption" weight="SemiBold" color={palette.success[700]}>
              Operasyonel göreve bağlı
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.sm,
    padding: 0,
    overflow: 'hidden',
  },
  bar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  body: {
    paddingLeft: spacing.md + 4,
    paddingRight: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tag: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  urgentTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: palette.danger[50],
  },
  tagNeutral: {
    borderRadius: radii.full,
    backgroundColor: palette.slate[100],
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  progressRow: {
    gap: 4,
  },
  progressTrack: {
    height: 5,
    borderRadius: radii.full,
    backgroundColor: palette.slate[100],
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radii.full,
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
})
