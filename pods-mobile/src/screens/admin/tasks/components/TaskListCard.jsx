import React from 'react'
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Calendar, ChevronRight } from 'lucide-react-native'
import {
  TASK_STATUS,
  isApprovedTaskStatus,
  normalizeTaskStatus,
} from '../../../../lib/taskStatus'
import { cubicle } from '../../../../ui'
import { isUrgentTask } from '../lib/tasksListGrouping'
import { getTaskTypeKey, resolveTaskTypeLabel } from '../lib/taskTypeLabels'
import { Text, spacing, radii, palette, shadows } from '../../../../ui'

function statusAccent(durum, deletionPending) {
  if (deletionPending) return cubicle.statusWaiting
  const d = normalizeTaskStatus(durum)
  if (d === TASK_STATUS.APPROVED) return cubicle.statusOnTime
  if (d === TASK_STATUS.REJECTED) return cubicle.statusOverdue
  if (d === TASK_STATUS.PENDING_APPROVAL || d === TASK_STATUS.RESUBMITTED) return cubicle.statusWaiting
  return cubicle.statusTodo
}

function statusLabel(durum, deletionPending) {
  if (deletionPending) return 'Silme bekliyor'
  return normalizeTaskStatus(durum) || '—'
}

function formatMeta(task) {
  const raw = task?.son_tarih || task?.baslama_tarihi
  let dateLabel = 'Tarih yok'
  let overdue = false

  if (raw) {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) {
      const now = new Date()
      overdue = !isApprovedTaskStatus(task?.durum) && !!task?.son_tarih && d < now
      const today =
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      dateLabel = today
        ? `Bugün ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
        : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
    }
  }

  return { dateLabel, overdue }
}

function MetaLine({ parts }) {
  const items = parts.filter(Boolean)
  if (!items.length) return null
  return (
    <View style={styles.metaRow}>
      <Calendar size={14} color={palette.slate[400]} strokeWidth={2} />
      <Text variant="caption" color={palette.slate[500]} numberOfLines={1} style={styles.metaText}>
        {items.map((part, i) => (
          <Text
            key={part.key}
            weight={part.emphasis ? 'SemiBold' : undefined}
            color={part.color || palette.slate[500]}
          >
            {i > 0 ? ' · ' : ''}
            {part.text}
          </Text>
        ))}
      </Text>
    </View>
  )
}

function ActionItem({ label, onPress, disabled, loading, tone = 'default', showChevron }) {
  const colors = {
    default: palette.slate[600],
    primary: palette.primary[700],
    danger: palette.danger[600],
  }
  const color = colors[tone] || colors.default

  return (
    <TouchableOpacity
      style={styles.actionItem}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.65}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <>
          <Text variant="caption" weight="SemiBold" color={color}>
            {label}
          </Text>
          {showChevron ? (
            <ChevronRight size={14} color={palette.slate[300]} strokeWidth={2.2} />
          ) : null}
        </>
      )}
    </TouchableOpacity>
  )
}

function ActionDivider() {
  return <View style={styles.actionDivider} />
}

export default function TaskListCard({
  task,
  companyName,
  assigneeName,
  onDetail,
  onEdit,
  onDelete,
  onWorkPress,
  workAction,
  showDelete,
  showEdit,
  deletionPending,
  actionBusy,
}) {
  const accent = statusAccent(task?.durum, deletionPending)
  const urgent = isUrgentTask(task)
  const { dateLabel, overdue } = formatMeta(task)
  const typeKey = getTaskTypeKey(task)
  const typeLabel = typeKey !== 'normal' ? resolveTaskTypeLabel(task) : null
  const person = assigneeName && assigneeName !== '-' ? assigneeName : 'Atanmadı'

  const metaParts = [
    {
      key: 'date',
      text: overdue ? `Gecikmiş, ${dateLabel}` : dateLabel,
      color: overdue ? palette.danger[600] : palette.slate[500],
      emphasis: overdue,
    },
    { key: 'person', text: person },
    typeLabel ? { key: 'type', text: typeLabel } : null,
    urgent ? { key: 'urgent', text: 'Acil', color: palette.danger[600], emphasis: true } : null,
  ]

  return (
    <View style={styles.card}>
      <View style={[styles.accent, { backgroundColor: accent }]} />

      <View style={styles.body}>
        <View style={styles.header}>
          <View style={styles.headerMain}>
            <Text variant="bodyMd" weight="SemiBold" color={palette.slate[900]} numberOfLines={2}>
              {task.baslik || 'Görev'}
            </Text>
            {companyName ? (
              <Text variant="caption" color={palette.slate[500]} numberOfLines={1} style={styles.company}>
                {companyName}
              </Text>
            ) : null}
          </View>

          <View style={styles.statusWrap}>
            <View style={[styles.statusDot, { backgroundColor: accent }]} />
            <Text variant="caption" weight="SemiBold" color={palette.slate[600]} numberOfLines={2}>
              {statusLabel(task?.durum, deletionPending)}
            </Text>
          </View>
        </View>

        <MetaLine parts={metaParts} />

        <View style={styles.footer}>
          <ActionItem
            label="Detay"
            tone="primary"
            onPress={onDetail}
            disabled={actionBusy}
            showChevron
          />
          {workAction?.show ? (
            <>
              <ActionDivider />
              <ActionItem
                label={workAction.label || 'Yap'}
                tone="primary"
                onPress={onWorkPress}
                disabled={actionBusy}
              />
            </>
          ) : null}
          {showEdit ? (
            <>
              <ActionDivider />
              <ActionItem label="Düzenle" onPress={onEdit} disabled={actionBusy} />
            </>
          ) : null}
          {showDelete ? (
            <>
              <ActionDivider />
              <ActionItem
                label="Sil"
                tone="danger"
                onPress={onDelete}
                disabled={actionBusy}
                loading={actionBusy}
              />
            </>
          ) : null}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.slate[100],
    overflow: 'hidden',
    ...shadows.sm,
  },
  accent: {
    width: 3,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: 13,
    paddingBottom: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: 8,
  },
  headerMain: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  company: {
    lineHeight: 16,
  },
  statusWrap: {
    alignItems: 'flex-end',
    maxWidth: 88,
    gap: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  metaText: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.slate[100],
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.sm,
  },
  actionItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 11,
  },
  actionDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: palette.slate[100],
    marginVertical: 10,
  },
})
