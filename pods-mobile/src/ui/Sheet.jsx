import React from 'react'
import { Modal, Pressable, View, StyleSheet } from 'react-native'
import { palette, radii, shadows, spacing } from './tokens'

/**
 * Alt yapışkan sheet sarmalı. Backdrop ile dışarı tıklayınca kapanır.
 *
 * <Sheet visible={open} onClose={...}>
 *   ...
 * </Sheet>
 */
export default function Sheet({ visible, onClose, children, padding = 'md', maxHeight, style }) {
  const pad = PADDINGS[padding] ?? PADDINGS.md
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingHorizontal: pad, paddingBottom: pad, paddingTop: spacing.lg, maxHeight }, style]}>
        <View style={styles.grabber} />
        {children}
      </View>
    </Modal>
  )
}

const PADDINGS = {
  none: 0,
  sm: spacing.lg,
  md: spacing.xl,
  lg: spacing['2xl'],
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.overlay,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii['3xl'],
    borderTopRightRadius: radii['3xl'],
    ...shadows.xl,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: palette.slate[200],
    marginBottom: spacing.lg,
  },
})
