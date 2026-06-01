import { palette } from './palette'

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
  pill: 9999,
}

/** CSS box-shadow strings for web */
export const shadowCss = {
  none: 'none',
  xs: `0 1px 4px ${palette.primary[700]}0d`,
  sm: `0 2px 8px ${palette.primary[700]}0f`,
  md: `0 6px 16px ${palette.primary[700]}1a`,
  lg: `0 10px 24px ${palette.primary[700]}24`,
  xl: `0 16px 36px ${palette.primary[700]}33`,
  accent: `0 8px 18px ${palette.accent[500]}47`,
  blurple: `0 8px 18px ${palette.blurple[500]}3d`,
  primary: `0 10px 20px ${palette.primary[700]}52`,
  success: `0 7px 16px ${palette.success[500]}38`,
  danger: `0 7px 16px ${palette.danger[500]}3d`,
}

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

export const motion = {
  fast: 150,
  base: 220,
  slow: 320,
}

export const z = {
  base: 0,
  raised: 1,
  sticky: 10,
  overlay: 20,
  modal: 30,
  toast: 40,
}

export default { spacing, radii, shadowCss, gradients, motion, z }
