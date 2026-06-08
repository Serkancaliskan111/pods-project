import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Button as KitButton, spacing as kitSpacing } from '../../ui'

/**
 * Görev atama sihirbazı alt çubuğu — ana sayfa KitButton stilleri.
 */
export default function TaskFlowWizardFooter({
  showBack,
  onBack,
  onNext,
  nextLabel = 'İleri',
  nextLoading = false,
  nextDisabled = false,
  nextVariant = 'primary',
}) {
  return (
    <View style={styles.row}>
      {showBack ? (
        <KitButton variant="secondary" size="lg" onPress={onBack} style={styles.back}>
          Geri
        </KitButton>
      ) : (
        <View style={styles.backSpacer} />
      )}
      <KitButton
        variant={nextVariant}
        size="lg"
        onPress={onNext}
        loading={nextLoading}
        disabled={nextDisabled}
        style={styles.next}
      >
        {nextLabel}
      </KitButton>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.md,
  },
  back: {
    flex: 1,
    minWidth: 0,
  },
  backSpacer: {
    flex: 1,
  },
  next: {
    flex: 1.4,
    minWidth: 0,
  },
})
