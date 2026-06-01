import React from 'react'
import { ActivityIndicator, TouchableOpacity, StyleSheet, View } from 'react-native'
import Text from './Text'
import { palette, radii, shadows, spacing } from './tokens'

const VARIANTS = {
  primary: {
    background: palette.primary[700],
    text: palette.surface,
    border: palette.primary[700],
    pressed: palette.primary[600],
    shadow: shadows.primary,
  },
  accent: {
    background: palette.accent[500],
    text: palette.surface,
    border: palette.accent[500],
    pressed: palette.accent[600],
    shadow: shadows.accent,
  },
  blurple: {
    background: palette.blurple[500],
    text: palette.surface,
    border: palette.blurple[500],
    pressed: palette.blurple[600],
    shadow: shadows.blurple,
  },
  secondary: {
    background: palette.slate[50],
    text: palette.primary[700],
    border: palette.slate[100],
    pressed: palette.slate[100],
    shadow: shadows.xs,
  },
  ghost: {
    background: 'transparent',
    text: palette.primary[700],
    border: 'transparent',
    pressed: palette.slate[50],
    shadow: shadows.none,
  },
  danger: {
    background: palette.danger[500],
    text: palette.surface,
    border: palette.danger[500],
    pressed: palette.danger[600],
    shadow: shadows.danger,
  },
  success: {
    background: palette.success[500],
    text: palette.surface,
    border: palette.success[500],
    pressed: palette.success[600],
    shadow: shadows.success,
  },
  outline: {
    background: palette.surface,
    text: palette.primary[700],
    border: palette.slate[200],
    pressed: palette.slate[50],
    shadow: shadows.xs,
  },
}

const SIZES = {
  sm: { height: 36, paddingHorizontal: spacing.lg, fontVariant: 'caption', radius: radii.pill, iconSize: 14 },
  md: { height: 44, paddingHorizontal: spacing.xl, fontVariant: 'body', radius: radii.pill, iconSize: 16 },
  lg: { height: 52, paddingHorizontal: spacing['2xl'], fontVariant: 'bodyLg', radius: radii.pill, iconSize: 18 },
}

/**
 * Bold Productivity butonu. Full-rounded, ikon slotu, loading, disabled,
 * full-width.
 *
 * <Button variant="accent" size="lg" iconLeft={<Send size={16} />}>Gönder</Button>
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  onPress,
  children,
  style,
  textStyle,
  ...rest
}) {
  const variantStyle = VARIANTS[variant] || VARIANTS.primary
  const sizeStyle = SIZES[size] || SIZES.md
  const isDisabled = disabled || loading
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={isDisabled}
      onPress={onPress}
      style={[
        styles.base,
        {
          height: sizeStyle.height,
          paddingHorizontal: sizeStyle.paddingHorizontal,
          borderRadius: sizeStyle.radius,
          backgroundColor: variantStyle.background,
          borderColor: variantStyle.border,
        },
        variantStyle.shadow,
        fullWidth ? styles.fullWidth : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variantStyle.text} />
      ) : (
        <View style={styles.row}>
          {iconLeft ? <View style={styles.iconLeft}>{iconLeft}</View> : null}
          {typeof children === 'string' ? (
            <Text
              variant={sizeStyle.fontVariant}
              weight="SemiBold"
              color={variantStyle.text}
              style={textStyle}
            >
              {children}
            </Text>
          ) : (
            children
          )}
          {iconRight ? <View style={styles.iconRight}>{iconRight}</View> : null}
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  fullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
  disabled: {
    opacity: 0.6,
  },
})
