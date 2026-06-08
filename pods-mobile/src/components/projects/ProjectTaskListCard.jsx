import React from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Calendar, ChevronRight } from 'lucide-react-native'
import { getProjectTaskStatusOption } from '../../lib/projectStatus'
import { isProjectTaskOverdue } from '../../lib/projectGanttUtils'
import { Text, palette, spacing, radii, shadows, cubicle } from '../../ui'

function formatSchedule(task) {
  const raw = task?.son_tarih || task?.baslangic_tarihi || task?.bitis_tarihi
  if (!raw) return 'Tarih yok'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return 'Tarih yok'
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function statusAccent(task) {
  const st = getProjectTaskStatusOption(task?.durum)
  if (isProjectTaskOverdue(task)) return cubicle.statusOverdue
  if (st.value === 'tamamlandi') return cubicle.statusOnTime
  return cubicle.statusTodo
}

export default function ProjectTaskListCard({
  task,
  companyName,
  assigneeName,
  taskTypeLabel,
  onPress,
  showEdit,
  onEdit,
  onDelete,
}) {
  const st = getProjectTaskStatusOption(task?.durum)
  const overdue = isProjectTaskOverdue(task)
  const bar = statusAccent(task)

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={() => onPress?.(task)} style={styles.card}>
      <View style={[styles.bar, { backgroundColor: bar }]} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.titleCol}>
            <Text variant="bodySm" weight="Bold" color={palette.slate[900]} numberOfLines={2}>
              {task?.baslik || 'Görev'}
            </Text>
            {companyName ? (
              <Text variant="caption" color={palette.slate[500]} numberOfLines={1} style={{ marginTop: 2 }}>
                {companyName}
              </Text>
            ) : null}
          </View>
          <ChevronRight size={18} color={palette.slate[400]} strokeWidth={2} />
        </View>

        <View style={styles.badges}>
          {task?.acil ? (
            <View style={styles.urgentBadge}>
              <Text variant="caption" weight="Bold" color={palette.danger[700]} style={styles.badgeText}>
                ACİL
              </Text>
            </View>
          ) : null}
          <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
            <Text variant="caption" weight="Bold" style={{ color: st.color, fontSize: 10 }}>
              {st.label}
            </Text>
          </View>
          {task?.bagli_is_id ? (
            <View style={styles.linkedBadge}>
              <Text variant="caption" weight="Bold" color={palette.success[700]} style={styles.badgeText}>
                Operasyonel
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.metaRow}>
          <Calendar size={14} color={palette.slate[400]} strokeWidth={2} />
          <Text
            variant="caption"
            weight={overdue ? 'Bold' : 'Medium'}
            color={overdue ? palette.danger[600] : palette.slate[500]}
            numberOfLines={1}
            style={styles.metaText}
          >
            {formatSchedule(task)}
            {overdue ? ' · gecikmiş' : ''}
          </Text>
        </View>

        <Text variant="caption" color={palette.slate[500]} numberOfLines={1}>
          {taskTypeLabel || 'Görev'} · Sorumlu: {assigneeName || 'Atanmamış'}
        </Text>

        {showEdit ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={(e) => {
                e?.stopPropagation?.()
                onEdit?.(task)
              }}
              activeOpacity={0.85}
            >
              <Text variant="caption" weight="Bold" color={palette.slate[700]}>
                Düzenle
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[200],
    overflow: 'hidden',
    ...shadows.sm,
  },
  bar: {
    width: 4,
  },
  body: {
    flex: 1,
    minWidth: 0,
    padding: spacing.md,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  urgentBadge: {
    backgroundColor: palette.danger[50],
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  statusBadge: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  linkedBadge: {
    backgroundColor: palette.success[50],
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    flex: 1,
    minWidth: 0,
  },
  actions: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  editBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[200],
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: palette.slate[50],
  },
})
