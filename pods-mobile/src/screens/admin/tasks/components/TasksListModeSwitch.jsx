import React from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Text, palette, spacing, radii } from '../../../../ui'

export default function TasksListModeSwitch({ mode, onChange, pendingCount = 0, completedCount = 0 }) {
  const fmt = (n) => (n > 99 ? '99+' : String(n))

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        activeOpacity={0.88}
        style={[styles.seg, mode === 'pending' && styles.segActivePending]}
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
              color={mode === 'pending' ? '#C2410C' : palette.slate[600]}
            >
              {fmt(pendingCount)}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.88}
        style={[styles.seg, mode === 'completed' && styles.segActiveCompleted]}
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
              color={mode === 'completed' ? '#166534' : palette.slate[600]}
            >
              {fmt(completedCount)}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  seg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.slate[200],
  },
  segActivePending: {
    backgroundColor: '#EA580C',
    borderColor: '#EA580C',
  },
  segActiveCompleted: {
    backgroundColor: palette.success[600],
    borderColor: palette.success[600],
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
