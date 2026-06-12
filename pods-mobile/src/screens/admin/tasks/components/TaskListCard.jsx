import React, { useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import {
  ClipboardList,
  LayoutTemplate,
  Link2,
  ShieldCheck,
  Workflow,
  ListChecks,
  UserRound,
  Calendar,
  CircleDot,
  ChevronRight,
  Pencil,
  Trash2,
} from 'lucide-react-native'
import { isApprovedTaskStatus, normalizeTaskStatus } from '../../../../lib/taskStatus'
import { isUrgentTask } from '../lib/tasksListGrouping'
import { resolveTaskTypeVisual } from '../lib/taskTypeLabels'
import { INFO_TILE_VISUALS, resolveStatusTileVisual } from '../lib/tasksListTheme'
import { Card, Text, Button, spacing, radii, palette, cubicle } from '../../../../ui'

const TASK_TYPE_ICONS = {
  normal: ClipboardList,
  sablon_gorev: LayoutTemplate,
  zincir_gorev: Link2,
  zincir_onay: ShieldCheck,
  zincir_gorev_ve_onay: Workflow,
  sirali_gorev: ListChecks,
}

function statusLabel(durum, deletionPending) {
  if (deletionPending) return 'Silme bekliyor'
  return normalizeTaskStatus(durum) || 'Bekliyor'
}

function formatDueDate(task) {
  const raw = task?.son_tarih || task?.baslama_tarihi
  if (!raw) return { text: '—', overdue: false }

  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return { text: '—', overdue: false }

  const now = new Date()
  const overdue =
    !isApprovedTaskStatus(task?.durum) && !!task?.son_tarih && d.getTime() < now.getTime()

  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const isTomorrow =
    d.getDate() === tomorrow.getDate() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getFullYear() === tomorrow.getFullYear()

  if (isToday) {
    return { text: `Bugün ${time}`, overdue }
  }
  if (isTomorrow) {
    return { text: `Yarın ${time}`, overdue: false }
  }

  const datePart = d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
  })
  return { text: `${datePart} ${time}`, overdue }
}

function TaskTypeIcon({ task }) {
  const visual = resolveTaskTypeVisual(task)
  const Icon = TASK_TYPE_ICONS[visual.key] || ClipboardList

  return (
    <View
      style={[
        styles.typeIconWrap,
        {
          backgroundColor: visual.bg,
          borderColor: visual.border,
          shadowColor: visual.shadow || visual.icon,
        },
      ]}
      accessibilityLabel={`Görev tipi: ${visual.label}`}
      accessibilityRole="image"
    >
      <View style={[styles.typeIconInner, { backgroundColor: visual.iconBg }]}>
        <Icon size={22} color={visual.icon} strokeWidth={2.3} />
      </View>
    </View>
  )
}

function InfoTile({ icon: Icon, visual, label, value, valueColor }) {
  return (
    <View style={[styles.tile, { backgroundColor: visual.bg, borderColor: visual.border }]}>
      <View style={[styles.tileIcon, { backgroundColor: visual.iconBg }]}>
        <Icon size={14} color={visual.icon} strokeWidth={2.4} />
      </View>
      <Text variant="overline" color={visual.label} numberOfLines={1} style={styles.tileLabel}>
        {label}
      </Text>
      <Text
        variant="overline"
        weight="Bold"
        color={valueColor || visual.text}
        numberOfLines={3}
        style={styles.tileValue}
      >
        {value}
      </Text>
    </View>
  )
}

export default function TaskListCard({
  task,
  assignerName,
  onDetail,
  onEdit,
  onDelete,
  showDelete,
  showEdit,
  deletionPending,
  actionBusy,
}) {
  const urgent = isUrgentTask(task)
  const typeVisual = useMemo(() => resolveTaskTypeVisual(task), [task])
  const assigner = assignerName && assignerName !== '-' ? assignerName : 'Belirtilmemiş'
  const { text: dueText, overdue } = useMemo(() => formatDueDate(task), [task])
  const statusVisual = useMemo(
    () => resolveStatusTileVisual(task?.durum, deletionPending),
    [task?.durum, deletionPending],
  )
  const statusText = statusLabel(task?.durum, deletionPending)
  const dateVisual = overdue ? INFO_TILE_VISUALS.dateOverdue : INFO_TILE_VISUALS.date
  const hasFooter = showEdit || showDelete

  return (
    <Card
      tone="surface"
      elevated
      padding="none"
      style={[
        styles.shell,
        urgent && styles.shellUrgent,
        overdue && !urgent && styles.shellOverdue,
      ]}
    >
      <TouchableOpacity
        style={styles.main}
        onPress={onDetail}
        disabled={actionBusy}
        activeOpacity={0.86}
        accessibilityRole="button"
        accessibilityLabel={`${typeVisual.label}, ${task.baslik || 'Görev'}, detay için dokunun`}
      >
        <View style={styles.titleRow}>
          <TaskTypeIcon task={task} />
          <View style={styles.titleCol}>
            <View style={[styles.typeChip, { backgroundColor: typeVisual.iconBg, borderColor: typeVisual.border }]}>
              <Text variant="caption" weight="Bold" color={typeVisual.icon} style={styles.typeChipText}>
                {typeVisual.label}
              </Text>
            </View>
            <Text variant="bodyMd" weight="Bold" color={palette.slate[900]} numberOfLines={2} style={styles.title}>
              {task.baslik || 'Görev'}
            </Text>
            {urgent ? (
              <View style={styles.urgentBadge}>
                <Text variant="caption" weight="Bold" color="#B91C1C" style={styles.urgentBadgeText}>
                  ACİL
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.chevronWrap}>
            <ChevronRight size={18} color={cubicle.sidebarBg} strokeWidth={2.4} />
          </View>
        </View>

        <View style={styles.tileRow}>
          <InfoTile icon={UserRound} visual={INFO_TILE_VISUALS.assigner} label="Atayan" value={assigner} />
          <InfoTile
            icon={Calendar}
            visual={dateVisual}
            label="Son tarih"
            value={dueText}
            valueColor={overdue ? cubicle.statusOverdue : dateVisual.text}
          />
          <InfoTile
            icon={CircleDot}
            visual={statusVisual}
            label="Görev durumu"
            value={statusText}
            valueColor={statusVisual.value}
          />
        </View>
      </TouchableOpacity>

      {hasFooter ? (
        <View style={styles.footer}>
          {showEdit ? (
            <Button
              variant="outline"
              size="sm"
              iconLeft={<Pencil size={14} color={palette.primary[700]} strokeWidth={2.2} />}
              onPress={onEdit}
              disabled={actionBusy}
              style={styles.footerBtn}
            >
              Düzenle
            </Button>
          ) : null}
          {showDelete ? (
            <Button
              variant="outline"
              size="sm"
              iconLeft={
                actionBusy ? (
                  <ActivityIndicator size="small" color={palette.danger[600]} />
                ) : (
                  <Trash2 size={14} color={palette.danger[600]} strokeWidth={2.2} />
                )
              }
              onPress={onDelete}
              disabled={actionBusy}
              style={[styles.footerBtn, styles.footerBtnDanger]}
            >
              Sil
            </Button>
          ) : null}
        </View>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  shell: {
    marginBottom: spacing.sm,
    overflow: 'hidden',
    borderRadius: radii.xl,
  },
  shellUrgent: {
    borderColor: cubicle.urgentBar,
    backgroundColor: cubicle.urgentGlow,
  },
  shellOverdue: {
    borderColor: `${cubicle.statusOverdue}44`,
    backgroundColor: `${cubicle.statusOverdue}10`,
  },
  main: {
    padding: spacing.md,
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  typeIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  typeIconInner: {
    width: 38,
    height: 38,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  typeChip: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeChipText: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
  title: {
    lineHeight: 22,
  },
  urgentBadge: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  urgentBadgeText: {
    fontSize: 10,
    letterSpacing: 0.4,
  },
  chevronWrap: {
    width: 34,
    height: 34,
    borderRadius: radii.lg,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  tileRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 7,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 9,
    gap: 4,
    minHeight: 82,
  },
  tileIcon: {
    width: 26,
    height: 26,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 0.35,
    fontWeight: '600',
  },
  tileValue: {
    fontSize: 10,
    lineHeight: 13,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.slate[100],
  },
  footerBtn: {
    flex: 1,
  },
  footerBtnDanger: {
    borderColor: palette.danger[200],
  },
})
