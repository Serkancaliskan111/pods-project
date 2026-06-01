import React from 'react'
import { TouchableOpacity, View, StyleSheet } from 'react-native'
import Text from './Text'
import { tones, palette, radii, spacing, shadows } from './tokens'

/**
 * Filter chip / pill etiketi. `tone` (renkli pastel) ile `selected` (full
 * primary dolgu) durumları arasında geçiş yapar.
 */
export default function Chip({
  tone = 'soft',
  selected = false,
  onPress,
  iconLeft,
  iconRight,
  children,
  size = 'md',
  style,
  textStyle,
  ...rest
}) {
  const toneStyle = tones[tone] || tones.soft
  const dims = SIZES[size] || SIZES.md
  const background = selected ? palette.primary[700] : toneStyle.background
  const border = selected ? palette.primary[700] : toneStyle.border
  const textColor = selected ? palette.surface : toneStyle.text
  const Comp = onPress ? TouchableOpacity : View
  return (
    <Comp
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.base,
        {
          height: dims.height,
          paddingHorizontal: dims.paddingHorizontal,
          backgroundColor: background,
          borderColor: border,
        },
        selected ? shadows.xs : null,
        style,
      ]}
      {...rest}
    >
      {iconLeft ? <View style={styles.iconLeft}>{iconLeft}</View> : null}
      {typeof children === 'string' ? (
        <Text variant={dims.fontVariant} weight={selected ? 'Bold' : 'SemiBold'} color={textColor} style={textStyle}>
          {children}
        </Text>
      ) : (
        children
      )}
      {iconRight ? <View style={styles.iconRight}>{iconRight}</View> : null}
    </Comp>
  )
}

const SIZES = {
  sm: { height: 26, paddingHorizontal: spacing.md, fontVariant: 'overline' },
  md: { height: 32, paddingHorizontal: spacing.lg, fontVariant: 'bodySm' },
  lg: { height: 40, paddingHorizontal: spacing.xl, fontVariant: 'body' },
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  iconLeft: { marginRight: 6 },
  iconRight: { marginLeft: 6 },
})
