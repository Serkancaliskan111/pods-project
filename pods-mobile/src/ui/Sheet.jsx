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
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
        <View
          style={[
            styles.sheet,
            { paddingHorizontal: pad, paddingBottom: pad, paddingTop: spacing.lg, maxHeight },
            style,
          ]}
        >
          <View style={styles.grabber} />
          {children}
        </View>
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
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.overlay,
  },
  sheet: {
    width: '100%',
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
