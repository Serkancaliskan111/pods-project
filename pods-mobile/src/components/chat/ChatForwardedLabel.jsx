import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Forward } from 'lucide-react-native'

export default function ChatForwardedLabel({ theme }) {
  return (
    <View style={styles.wrap}>
      <Forward size={13} color={theme?.forwardLabel || theme?.textSecondary} strokeWidth={2.2} />
      <Text style={[styles.label, { color: theme?.forwardLabel || theme?.textSecondary }]}>İletildi</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
    paddingTop: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    fontStyle: 'italic',
  },
})
