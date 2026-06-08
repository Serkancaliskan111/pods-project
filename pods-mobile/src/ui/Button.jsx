import React, { useMemo } from 'react'
import { ActivityIndicator, TouchableOpacity, StyleSheet, View } from 'react-native'
import { useUiThemeOptional } from '../contexts/UiThemeContext'
import Text from './Text'
import { palette, radii, shadows, spacing } from './tokens'

function buildVariants(theme) {
  const brand = theme?.brandBlue ?? palette.info[600]
  const brandPressed = theme?.brandBluePressed ?? palette.info[700]
  const accent = theme?.accent ?? palette.accent[500]
  const accentPressed = theme?.accentPressed ?? palette.accent[600]
  const green = theme?.greenCta ?? palette.success[500]
  const greenPressed = theme?.greenCtaPressed ?? palette.success[600]
  const btnRadius = theme?.radii?.button ?? radii.pill

  return {
  primary: {
    background: brand,
    text: palette.surface,
    border: brand,
    pressed: brandPressed,
    shadow: shadows.primary,
    radius: btnRadius,
  },
  accent: {
    background: accent,
    text: palette.surface,
    border: accent,
    pressed: accentPressed,
    shadow: shadows.accent,
    radius: btnRadius,
  },
  blurple: {
    background: palette.blurple[500],
    text: palette.surface,
    border: palette.blurple[500],
    pressed: palette.blurple[600],
    shadow: shadows.blurple,
    radius: btnRadius,
  },
  secondary: {
    background: palette.slate[50],
    text: brand,
    border: palette.slate[100],
    pressed: palette.slate[100],
    shadow: shadows.xs,
    radius: btnRadius,
  },
  ghost: {
    background: 'transparent',
    text: brand,
    border: 'transparent',
    pressed: palette.slate[50],
    shadow: shadows.none,
    radius: btnRadius,
  },
  danger: {
    background: palette.danger[500],
    text: palette.surface,
    border: palette.danger[500],
    pressed: palette.danger[600],
    shadow: shadows.danger,
    radius: btnRadius,
  },
  success: {
    background: green,
    text: palette.surface,
    border: green,
    pressed: greenPressed,
    shadow: shadows.success,
    radius: btnRadius,
  },
  outline: {
    background: palette.surface,
    text: brand,
    border: theme?.border ?? palette.slate[200],
    pressed: palette.slate[50],
    shadow: shadows.xs,
    radius: btnRadius,
  },
  }
}

const STATIC_VARIANTS = buildVariants(null)

const SIZES = {
  sm: { height: 36, paddingHorizontal: spacing.lg, fontVariant: 'caption', iconSize: 14 },
  md: { height: 44, paddingHorizontal: spacing.xl, fontVariant: 'body', iconSize: 16 },
  lg: { height: 52, paddingHorizontal: spacing['2xl'], fontVariant: 'bodyLg', iconSize: 18 },
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
  const themeCtx = useUiThemeOptional()
  const variants = useMemo(
    () => (themeCtx?.theme ? buildVariants(themeCtx.theme) : STATIC_VARIANTS),
    [themeCtx?.theme],
  )
  const variantStyle = variants[variant] || variants.primary
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
          borderRadius: variantStyle.radius ?? radii.pill,
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
          {children != null && children !== false ? (
            typeof children === 'string' || typeof children === 'number' ? (
              <Text
                variant={sizeStyle.fontVariant}
                weight="SemiBold"
                color={variantStyle.text}
                style={textStyle}
              >
                {String(children)}
              </Text>
            ) : (
              children
            )
          ) : null}
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
