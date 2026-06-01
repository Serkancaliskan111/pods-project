import React from 'react'
import { View, StyleSheet } from 'react-native'
import Text from './Text'
import { tones, radii, spacing } from './tokens'

/**
 * "Onaylandı / Bekleyen / Reddedildi / Acil / Havuz" gibi durum etiketleri.
 * Renkli pastel arkaplan + koyu text + soft border.
 */
export default function StatusBadge({
  tone = 'soft',
  icon,
  children,
  size = 'md',
  uppercase = false,
  style,
}) {
  const toneStyle = tones[tone] || tones.soft
  const dims = SIZES[size] || SIZES.md
  return (
    <View
      style={[
        styles.base,
        {
          height: dims.height,
          paddingHorizontal: dims.paddingHorizontal,
          backgroundColor: toneStyle.background,
          borderColor: toneStyle.border,
        },
        style,
      ]}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      {typeof children === 'string' ? (
        <Text
          variant={dims.fontVariant}
          weight="Bold"
          color={toneStyle.text}
          style={uppercase ? { textTransform: 'uppercase', letterSpacing: 0.4 } : null}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  )
}

const SIZES = {
  sm: { height: 22, paddingHorizontal: spacing.sm, fontVariant: 'overline' },
  md: { height: 28, paddingHorizontal: spacing.md, fontVariant: 'caption' },
  lg: { height: 34, paddingHorizontal: spacing.lg, fontVariant: 'bodySm' },
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  icon: { marginRight: 6 },
})
