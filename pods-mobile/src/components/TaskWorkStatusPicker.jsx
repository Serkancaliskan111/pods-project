import React, { useCallback, useState } from 'react'
import { View, StyleSheet, Alert } from 'react-native'
import { updateTaskWorkStatus } from '../lib/taskWorkStatusApi'
import { getTaskWorkStatusOption, TASK_WORK_STATUS_OPTIONS } from '../lib/taskWorkStatus'
import { Text, Chip, palette, spacing } from '../ui'

export default function TaskWorkStatusPicker({ taskId, currentStatus, onUpdated }) {
  const [busy, setBusy] = useState(false)

  const apply = useCallback(
    async (next) => {
      if (!taskId || busy || next === currentStatus) return
      setBusy(true)
      try {
        await updateTaskWorkStatus(taskId, next)
        onUpdated?.(next)
      } catch (e) {
        Alert.alert('Çalışma durumu', e?.message || 'Güncellenemedi')
      } finally {
        setBusy(false)
      }
    },
    [taskId, busy, currentStatus, onUpdated],
  )

  const current = getTaskWorkStatusOption(currentStatus)

  return (
    <View style={styles.wrap}>
      <Text variant="caption" weight="SemiBold" color={palette.slate[500]} style={styles.label}>
        Çalışma durumu
      </Text>
      <View style={styles.row}>
        {TASK_WORK_STATUS_OPTIONS.map((opt) => {
          const active = String(currentStatus || '') === opt.value
          return (
            <Chip
              key={opt.value}
              selected={active}
              disabled={busy}
              onPress={() => void apply(opt.value)}
            >
              {opt.label}
            </Chip>
          )
        })}
      </View>
      <Text variant="caption" color={palette.slate[500]}>
        Şu an: {current.label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginVertical: spacing.md },
  label: { textTransform: 'uppercase', letterSpacing: 0.6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
})
