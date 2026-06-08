import React from 'react'
import { Text as RNText } from 'react-native'
import { useUiThemeOptional } from '../contexts/UiThemeContext'
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
  const themeCtx = useUiThemeOptional()
  const scale = themeCtx?.theme?.fontScale ?? 1
  const base = VARIANTS[variant] || VARIANTS.body
  const scaled =
    scale !== 1 && base?.fontSize
      ? { ...base, fontSize: Math.round(base.fontSize * scale), lineHeight: base.lineHeight ? Math.round(base.lineHeight * scale) : undefined }
      : base
  const fontFamilyOverride = weight
    ? `PlusJakartaSans-${weight}`
    : undefined
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        scaled,
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
