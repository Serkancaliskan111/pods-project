import React from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Text, palette, spacing, radii, cubicle } from '../../../../ui'
import { TASK_LIST_BRAND } from '../lib/tasksListTheme'

export default function TasksListModeSwitch({ mode, onChange, pendingCount = 0, completedCount = 0 }) {
  const fmt = (n) => (n > 99 ? '99+' : String(n))

  return (
    <View style={styles.shell}>
      <View style={styles.track}>
        <TouchableOpacity
          activeOpacity={0.88}
          style={[styles.seg, mode === 'pending' && styles.segActive]}
          onPress={() => onChange?.('pending')}
        >
          <Text
            variant="bodySm"
            weight="Bold"
            color={mode === 'pending' ? palette.surface : palette.slate[700]}
          >
            Bekleyen
          </Text>
          {pendingCount > 0 ? (
            <View style={[styles.badge, mode === 'pending' && styles.badgeOnActive]}>
              <Text
                variant="caption"
                weight="Bold"
                color={mode === 'pending' ? TASK_LIST_BRAND : palette.slate[600]}
              >
                {fmt(pendingCount)}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.88}
          style={[styles.seg, mode === 'completed' && styles.segActive]}
          onPress={() => onChange?.('completed')}
        >
          <Text
            variant="bodySm"
            weight="Bold"
            color={mode === 'completed' ? palette.surface : palette.slate[700]}
          >
            Tamamlanan
          </Text>
          {completedCount > 0 ? (
            <View style={[styles.badge, mode === 'completed' && styles.badgeOnActive]}>
              <Text
                variant="caption"
                weight="Bold"
                color={mode === 'completed' ? cubicle.statusOnTime : palette.slate[600]}
              >
                {fmt(completedCount)}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    marginBottom: spacing.md,
  },
  track: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  seg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: palette.slate[200],
    backgroundColor: palette.surface,
  },
  segActive: {
    backgroundColor: TASK_LIST_BRAND,
    borderColor: TASK_LIST_BRAND,
  },
  badge: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: radii.pill,
    backgroundColor: palette.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOnActive: {
    backgroundColor: palette.surface,
  },
})
