import React from 'react'
import { View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Eye } from 'lucide-react-native'
import { formatHiddenDueLabel } from '../lib/taskHomeHidden'
import { CenterModal, Text, Button, Card, Heading, palette, spacing } from '../ui'

export default function HiddenTasksModal({
  visible,
  onClose,
  tasks,
  loading,
  onRestore,
  restoringId,
  onOpenTask,
}) {
  return (
    <CenterModal visible={visible} onClose={onClose} maxWidth={400}>
      <Heading variant="h3" style={{ marginBottom: spacing.sm }}>
        Gizlenmiş görevlerim
      </Heading>
      <Text variant="bodySm" color={palette.slate[600]} style={{ marginBottom: spacing.md }}>
        Son tarihi bugünden önce olan gecikmiş görevler ana sayfada otomatik gizlenir. Bugün vadesi dolan
        gecikmiş görevler listede kalır.
      </Text>

      {loading ? (
        <ActivityIndicator color={palette.primary[500]} style={{ marginVertical: spacing.xl }} />
      ) : null}

      {!loading && !tasks?.length ? (
        <Text variant="bodySm" color={palette.slate[500]} align="center" style={{ paddingVertical: spacing.xl }}>
          Gizlenmiş görev yok.
        </Text>
      ) : null}

      <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: spacing.sm }}>
        {(tasks || []).map((task) => (
          <Card key={task.id} tone="surface" elevated style={{ marginBottom: spacing.sm }}>
            <TouchableOpacity onPress={() => onOpenTask?.(task)} activeOpacity={0.85}>
              <Text variant="bodyMd" weight="SemiBold" color={palette.slate[900]} numberOfLines={2}>
                {task.baslik || 'Görev'}
              </Text>
              <Text variant="caption" color={palette.danger[600]} style={{ marginTop: 4 }}>
                Gecikmiş · Son tarih: {formatHiddenDueLabel(task)}
              </Text>
              {task.projectLabel ? (
                <Text variant="caption" color={palette.slate[500]} style={{ marginTop: 2 }}>
                  {task.projectLabel}
                </Text>
              ) : null}
            </TouchableOpacity>
            <Button
              variant="primary"
              size="sm"
              fullWidth
              disabled={restoringId === task.id}
              onPress={() => onRestore?.(task)}
              style={{ marginTop: spacing.sm }}
              iconLeft={<Eye size={14} color={palette.surface} />}
            >
              {restoringId === task.id ? 'Ekleniyor…' : 'Ana sayfada göster'}
            </Button>
          </Card>
        ))}
      </ScrollView>
    </CenterModal>
  )
}
