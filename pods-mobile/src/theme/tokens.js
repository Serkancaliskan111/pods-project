import { palette } from './palette'

/**
 * Spacing scale (dp).
 * Kullanım: `spacing.lg`, `spacing['2xl']`.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 56,
  '6xl': 72,
}

/**
 * Köşe yuvarlaklığı (dp). Bold Productivity vibe için orta/üst aralıklar
 * cömert: `lg`-`2xl` kart, `3xl` sheet, `pill` full-rounded buton.
 */
export const radii = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
  pill: 999,
}

/**
 * Gölge tonları. Bold Productivity için "renkli soft shadow" kullanılır
 * (saf siyah yerine primary / accent / blurple kökü). RN'in iOS shadow
 * + Android elevation API'lerini paralel ayarlar.
 *
 * Kullanım:
 *   style={[styles.card, shadows.md]}
 */
const makeShadow = (color, opacity, radius, offsetY, elevation) => ({
  shadowColor: color,
  shadowOpacity: opacity,
  shadowRadius: radius,
  shadowOffset: { width: 0, height: offsetY },
  elevation,
})

export const shadows = {
  none: { shadowColor: 'transparent', shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  xs: makeShadow(palette.primary[700], 0.05, 4, 1, 1),
  sm: makeShadow(palette.primary[700], 0.06, 8, 2, 2),
  md: makeShadow(palette.primary[700], 0.1, 16, 6, 5),
  lg: makeShadow(palette.primary[700], 0.14, 24, 10, 9),
  xl: makeShadow(palette.primary[700], 0.2, 36, 16, 14),
  accent: makeShadow(palette.accent[500], 0.28, 18, 8, 6),
  blurple: makeShadow(palette.blurple[500], 0.24, 18, 8, 6),
  primary: makeShadow(palette.primary[700], 0.32, 20, 10, 7),
  success: makeShadow(palette.success[500], 0.22, 16, 7, 5),
  danger: makeShadow(palette.danger[500], 0.24, 16, 7, 5),
}

/**
 * Lineer gradient palet rampaları (`expo-linear-gradient` `colors` prop'una
 * doğrudan beslenir).
 */
export const gradients = {
  hero: [palette.primary[900], palette.primary[800], palette.primary[700]],
  heroSoft: [palette.primary[800], palette.primary[700]],
  executive: [palette.primary[900], palette.primary[800], palette.primary[700]],
  accent: [palette.accent[400], palette.accent[500], palette.accent[600]],
  accentSoft: [palette.accent[300], palette.accent[500]],
  blurple: [palette.blurple[400], palette.blurple[500], palette.blurple[600]],
  success: [palette.success[500], palette.success[600]],
  danger: [palette.danger[500], palette.danger[600]],
  slate: [palette.slate[50], palette.surface],
  midnight: [palette.primary[900], palette.primary[800], palette.primary[600]],
}

/**
 * Hareket / animasyon süreleri (ms).
 */
export const motion = {
  fast: 150,
  base: 220,
  slow: 320,
  spring: { tension: 50, friction: 11 },
}

/**
 * Z-index dilimleri (tutarlılık için).
 */
export const z = {
  base: 0,
  raised: 1,
  sticky: 10,
  overlay: 20,
  modal: 30,
  toast: 40,
}

export default {
  spacing,
  radii,
  shadows,
  gradients,
  motion,
  z,
}
