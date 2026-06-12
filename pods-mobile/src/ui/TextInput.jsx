import React, { forwardRef } from 'react'
import { TextInput as RNTextInput, Platform } from 'react-native'
import { fontFamilies } from '../theme/typography'
import { palette, radii, spacing } from './tokens'

/** Tüm TextInput'larda paylaşılan RN prop varsayılanları */
export const TEXT_INPUT_DEFAULTS = {
  placeholderTextColor: palette.slate[400],
  underlineColorAndroid: 'transparent',
  selectionColor: palette.primary[500],
  cursorColor: palette.primary[700],
}

const androidBase = Platform.OS === 'android' ? { includeFontPadding: false } : null

/** Ham RN TextInput için temel stil (StyleSheet.create dışında da kullanılır) */
export const textInputBaseStyle = {
  fontFamily: fontFamilies.medium,
  fontSize: 15,
  color: palette.slate[800],
  ...androidBase,
}

/** Kenarlıklı form alanı */
export const textInputFieldStyle = {
  ...textInputBaseStyle,
  borderWidth: 1,
  borderColor: palette.slate[200],
  borderRadius: radii.lg,
  paddingHorizontal: spacing.md,
  paddingVertical: Platform.OS === 'ios' ? spacing.sm + 2 : spacing.sm,
  minHeight: 48,
  backgroundColor: palette.slate[50],
}

/**
 * Satır içi (ikon + göz butonu vb.) sarmalayıcıdaki input.
 * Android'de flex satırda genişlik çökmesini `minWidth: 0` engeller.
 */
export const textInputInlineStyle = {
  ...textInputBaseStyle,
  flex: 1,
  minWidth: 0,
  minHeight: 40,
  paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  backgroundColor: 'transparent',
}

/**
 * Eski ekranlar için global RN TextInput defaultProps patch'i.
 * `App.js` fontlar yüklendikten sonra bir kez çağırır.
 */
export function patchTextInputGlobals(RNTextInputComponent) {
  const prev = RNTextInputComponent.defaultProps || {}
  const prevStyle = prev.style
  RNTextInputComponent.defaultProps = {
    ...prev,
    placeholderTextColor: TEXT_INPUT_DEFAULTS.placeholderTextColor,
    underlineColorAndroid: TEXT_INPUT_DEFAULTS.underlineColorAndroid,
    selectionColor: TEXT_INPUT_DEFAULTS.selectionColor,
    ...(Platform.OS === 'android' ? { cursorColor: TEXT_INPUT_DEFAULTS.cursorColor } : {}),
    style: [
      textInputBaseStyle,
      ...(Array.isArray(prevStyle) ? prevStyle : prevStyle ? [prevStyle] : []),
    ],
  }
}

/**
 * Görünür metin rengi, kenarlık ve Android şifre noktası için sistem fontu garantisi.
 *
 * `variant`:
 *   - `plain`  — yalnızca temel tipografi (satır içi veya özel sarmalayıcı)
 *   - `field`  — kenarlıklı form kutusu
 *   - `inline` — flex satır içi (Login, arama çubuğu)
 */
const AppTextInput = forwardRef(function AppTextInput(
  {
    style,
    variant = 'plain',
    secureTextEntry,
    placeholderTextColor,
    underlineColorAndroid,
    selectionColor,
    cursorColor,
    ...rest
  },
  ref,
) {
  const variantStyle =
    variant === 'field'
      ? textInputFieldStyle
      : variant === 'inline'
        ? textInputInlineStyle
        : null

  // Android: özel font + secureTextEntry → şifre noktaları görünmez
  const secureFontFix =
    secureTextEntry && Platform.OS === 'android' ? { fontFamily: undefined } : null

  return (
    <RNTextInput
      ref={ref}
      secureTextEntry={secureTextEntry}
      placeholderTextColor={placeholderTextColor ?? TEXT_INPUT_DEFAULTS.placeholderTextColor}
      underlineColorAndroid={underlineColorAndroid ?? TEXT_INPUT_DEFAULTS.underlineColorAndroid}
      selectionColor={selectionColor ?? TEXT_INPUT_DEFAULTS.selectionColor}
      cursorColor={cursorColor ?? TEXT_INPUT_DEFAULTS.cursorColor}
      style={[textInputBaseStyle, variantStyle, secureFontFix, style]}
      {...rest}
    />
  )
})

export default AppTextInput
