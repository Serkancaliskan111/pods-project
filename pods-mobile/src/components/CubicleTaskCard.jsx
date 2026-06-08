import React from 'react'
import { View, TouchableOpacity, ActivityIndicator } from 'react-native'
import { EyeOff } from 'lucide-react-native'
import { useAuth } from '../contexts/AuthContext'
import { hasManagementDashboardAccess } from '../lib/permissions'
import { isPendingApprovalTaskStatus, normalizeTaskStatus } from '../lib/taskStatus'
import { getTaskWorkStatusOption } from '../lib/taskWorkStatus'
import { useUiTheme } from '../contexts/UiThemeContext'
import { Card, Text, Button, palette, spacing } from '../ui'

function formatDue(task) {
  const end = task?.son_tarih ? new Date(task.son_tarih) : null
  if (!end || Number.isNaN(end.getTime())) return 'Son tarih: —'
  return `Son tarih: ${end.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

export default function CubicleTaskCard({
  task,
  onPress,
  onHideFromHome,
  hidingFromHome = false,
  urgent = false,
}) {
  const { theme } = useUiTheme()
  const { profile, personel, permissions } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const management = hasManagementDashboardAccess(permissions, isSystemAdmin)
  const isMine = String(task?.sorumlu_personel_id || '') === String(personel?.id || '')
  const badgeMeta = theme.statusBadge[task.tone] || theme.statusBadge.todo
  const barColor = urgent
    ? theme.section.urgent
    : task.tone === 'overdue'
      ? theme.status.overdue
      : task.tone === 'onTime'
        ? theme.status.onTime
        : task.tone === 'waiting'
          ? theme.status.waiting
          : theme.status.todo
  const workStatus = getTaskWorkStatusOption(task?.calisma_durumu)
  const showWorkBtn = task.workAction?.show || (!management && isMine)

  return (
    <Card
      tone="surface"
      elevated
      onPress={onPress}
      style={{
        marginBottom: spacing.sm,
        borderLeftWidth: 4,
        borderLeftColor: barColor,
        ...(urgent ? { borderWidth: 1, borderColor: palette.danger[200] } : {}),
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
        <Text variant="bodyMd" weight="SemiBold" color={palette.slate[900]} style={{ flex: 1 }}>
          {task.baslik || 'Görev'}
        </Text>
        <View
          style={{
            backgroundColor: badgeMeta.bg,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 8,
          }}
        >
          <Text variant="caption" weight="Bold" style={{ color: badgeMeta.text }}>
            {badgeMeta.label}
          </Text>
        </View>
      </View>

      <Text variant="caption" color={palette.slate[500]} style={{ marginTop: 4 }}>
        {task.projectLabel || formatDue(task)}
      </Text>

      {workStatus?.label ? (
        <Text variant="caption" color={palette.slate[600]} style={{ marginTop: 2 }}>
          Çalışma: {workStatus.label}
        </Text>
      ) : null}

      {isPendingApprovalTaskStatus(normalizeTaskStatus(task?.durum)) ? (
        <Text variant="caption" color={palette.warning[700]} style={{ marginTop: 2 }}>
          Onay bekliyor
        </Text>
      ) : null}

      {showWorkBtn ? (
        <Button variant="success" size="sm" onPress={onPress} style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}>
          {task.workAction?.label || 'Görevi yap'}
        </Button>
      ) : null}

      {onHideFromHome ? (
        <TouchableOpacity
          onPress={onHideFromHome}
          disabled={hidingFromHome}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm }}
        >
          {hidingFromHome ? (
            <ActivityIndicator size="small" color={palette.slate[500]} />
          ) : (
            <EyeOff size={14} color={palette.slate[500]} />
          )}
          <Text variant="caption" color={palette.slate[500]}>
            Ana sayfadan gizle
          </Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  )
}
