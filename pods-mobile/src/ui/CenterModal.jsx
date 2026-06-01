import React from 'react'
import { Modal, Pressable, View, StyleSheet } from 'react-native'
import { palette, radii, shadows, spacing } from './tokens'

/**
 * Merkez modal. Sheet'in dikine ortalı versiyonu; onay diyalogları, küçük
 * form modalları için.
 */
export default function CenterModal({ visible, onClose, children, padding = 'md', maxWidth = 360, style }) {
  const pad = PADDINGS[padding] ?? PADDINGS.md
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.center} pointerEvents="box-none">
        <View style={[styles.sheet, { padding: pad, maxWidth }, style]}>{children}</View>
      </View>
    </Modal>
  )
}

const PADDINGS = {
  sm: spacing.lg,
  md: spacing.xl,
  lg: spacing['2xl'],
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.overlay,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    backgroundColor: palette.surface,
    borderRadius: radii['2xl'],
    alignSelf: 'stretch',
    ...shadows.lg,
  },
})
