import React from 'react'
import { Text as RNText } from 'react-native'
import { typography } from './tokens'

const VARIANTS = typography

/**
 * Tüm metinler bu sarmaldan geçer. `variant` token'a denk düşer, ek `style`
 * verilebilir. Plus Jakarta Sans `fontFamily`'sini garanti altına alır.
 */
export default function Text({
  variant = 'body',
  color,
  align,
  weight,
  numberOfLines,
  style,
  children,
  ...rest
}) {
  const base = VARIANTS[variant] || VARIANTS.body
  const fontFamilyOverride = weight
    ? `PlusJakartaSans-${weight}`
    : undefined
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        base,
        color ? { color } : null,
        align ? { textAlign: align } : null,
        fontFamilyOverride ? { fontFamily: fontFamilyOverride } : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  )
}
