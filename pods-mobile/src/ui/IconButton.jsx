import React from 'react'
import { TouchableOpacity, StyleSheet } from 'react-native'
import { palette, radii, shadows } from './tokens'

const VARIANTS = {
  primary: { background: palette.primary[700], color: palette.surface, shadow: shadows.primary, border: palette.primary[700] },
  accent: { background: palette.accent[500], color: palette.surface, shadow: shadows.accent, border: palette.accent[500] },
  blurple: { background: palette.blurple[500], color: palette.surface, shadow: shadows.blurple, border: palette.blurple[500] },
  soft: { background: palette.slate[50], color: palette.primary[700], shadow: shadows.xs, border: palette.slate[100] },
  ghost: { background: 'transparent', color: palette.primary[700], shadow: shadows.none, border: 'transparent' },
  glass: { background: 'rgba(255,255,255,0.18)', color: palette.surface, shadow: shadows.none, border: 'rgba(255,255,255,0.32)' },
}

const SIZES = { sm: 32, md: 40, lg: 48, xl: 56 }

export default function IconButton({
  variant = 'soft',
  size = 'md',
  shape = 'circle',
  onPress,
  disabled = false,
  children,
  style,
  ...rest
}) {
  const variantStyle = VARIANTS[variant] || VARIANTS.soft
  const dim = SIZES[size] || SIZES.md
  const radius = shape === 'circle' ? dim / 2 : radii.lg
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.base,
        {
          width: dim,
          height: dim,
          borderRadius: radius,
          backgroundColor: variantStyle.background,
          borderColor: variantStyle.border,
        },
        variantStyle.shadow,
        disabled ? styles.disabled : null,
        style,
      ]}
      {...rest}
    >
      {/* Tüketici tipik olarak lucide ikon iletir, rengi içeride decide eder */}
      {typeof children === 'function' ? children({ color: variantStyle.color, size: Math.round(dim * 0.5) }) : children}
    </TouchableOpacity>
  )
}

IconButton.colorFor = (variant) => (VARIANTS[variant] || VARIANTS.soft).color

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  disabled: {
    opacity: 0.55,
  },
})
