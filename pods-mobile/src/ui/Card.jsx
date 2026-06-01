import React from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { tones, radii, shadows, spacing } from './tokens'

/**
 * Bold Productivity kartı. Tone'a göre arkaplan / kenarlık / metin tonları
 * değişir. `interactive` true ise TouchableOpacity sarmalı ile press feedback
 * verir. Default elevation seviyesi `sm`; `elevated` prop'u ile `md`'ye çıkar.
 */
export default function Card({
  tone = 'surface',
  elevated = false,
  floating = false,
  interactive = false,
  onPress,
  padding = 'md',
  radius = 'xl',
  style,
  children,
  ...rest
}) {
  const palette = tones[tone] || tones.surface
  const shadow = floating ? shadows.lg : elevated ? shadows.md : shadows.sm
  const pad = PADDINGS[padding] ?? PADDINGS.md
  const rad = radii[radius] ?? radii.xl
  const body = (
    <View
      style={[
        styles.base,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
          borderRadius: rad,
          padding: pad,
        },
        shadow,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  )
  if (interactive || onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
        {body}
      </TouchableOpacity>
    )
  }
  return body
}

const PADDINGS = {
  none: 0,
  xs: spacing.xs,
  sm: spacing.sm,
  md: spacing.lg,
  lg: spacing.xl,
  xl: spacing['2xl'],
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
  },
})
