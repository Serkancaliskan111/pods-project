import { palette } from './palette'

/**
 * Plus Jakarta Sans tipografi presetleri.
 *
 * Fontlar `App.js` içinde `expo-font` ile yüklenir; `fontFamily` alanı
 * ile React Native, ailesinin doğru weight varyantını seçer.
 *
 * Kullanım:
 *   <Text style={Typography.h1}>Başlık</Text>
 *   veya
 *   <Heading variant="h1">Başlık</Heading>  (UI Kit)
 */
export const fontFamilies = {
  extraBold: 'PlusJakartaSans-ExtraBold',
  bold: 'PlusJakartaSans-Bold',
  semiBold: 'PlusJakartaSans-SemiBold',
  medium: 'PlusJakartaSans-Medium',
  regular: 'PlusJakartaSans-Regular',
}

const baseText = {
  color: palette.slate[800],
  includeFontPadding: false,
}

export const typography = {
  displayLg: {
    ...baseText,
    fontFamily: fontFamilies.extraBold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.6,
  },
  displayMd: {
    ...baseText,
    fontFamily: fontFamilies.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  h1: {
    ...baseText,
    fontFamily: fontFamilies.bold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
  },
  h2: {
    ...baseText,
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  h3: {
    ...baseText,
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  bodyLg: {
    ...baseText,
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 22,
  },
  body: {
    ...baseText,
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  bodySm: {
    ...baseText,
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  caption: {
    ...baseText,
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
    color: palette.slate[500],
  },
  overline: {
    ...baseText,
    fontFamily: fontFamilies.bold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: palette.slate[500],
  },
  metric: {
    ...baseText,
    fontFamily: fontFamilies.extraBold,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.6,
  },
  metricSm: {
    ...baseText,
    fontFamily: fontFamilies.bold,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.4,
  },
}

export default typography
