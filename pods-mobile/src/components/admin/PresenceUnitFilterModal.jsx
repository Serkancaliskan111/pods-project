import React from 'react'
import { Modal, Pressable, FlatList, TouchableOpacity, View, StyleSheet } from 'react-native'
import { Text, palette, spacing, radii, shadows } from '../../ui'

export default function PresenceUnitFilterModal({ visible, units = [], selectedUnitId, onSelect, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text variant="bodyMd" weight="Bold" color={palette.slate[900]} style={styles.title}>
            Birim seç
          </Text>
          <FlatList
            data={[{ id: '', birim_adi: 'Tüm birimler' }, ...units]}
            keyExtractor={(item) => String(item.id || 'all')}
            style={{ maxHeight: 320 }}
            renderItem={({ item }) => {
              const active = String(selectedUnitId || '') === String(item.id || '')
              return (
                <TouchableOpacity
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => {
                    onSelect(String(item.id || ''))
                    onClose()
                  }}
                >
                  <Text variant="bodySm" weight={active ? 'Bold' : 'Medium'} color={active ? palette.primary[700] : palette.slate[800]}>
                    {item.birim_adi || 'Birim'}
                  </Text>
                </TouchableOpacity>
              )
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: palette.overlayLight,
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  sheet: {
    backgroundColor: palette.surface,
    borderRadius: radii['2xl'],
    padding: spacing.md,
    ...shadows.lg,
  },
  title: {
    marginBottom: spacing.sm,
  },
  row: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
  },
  rowActive: {
    backgroundColor: palette.primary[50],
  },
})
