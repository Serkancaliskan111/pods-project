import { palette } from './palette'

export const tones = {
  surface: {
    background: palette.surface,
    border: palette.slate[100],
    text: palette.slate[800],
    softText: palette.slate[500],
    icon: palette.primary[700],
    iconBg: palette.primary[50],
  },
  soft: {
    background: palette.slate[50],
    border: palette.slate[100],
    text: palette.slate[800],
    softText: palette.slate[500],
    icon: palette.primary[700],
    iconBg: palette.primary[100],
  },
  slate: {
    background: palette.slate[50],
    border: palette.slate[100],
    text: palette.slate[800],
    softText: palette.slate[500],
    icon: palette.slate[700],
    iconBg: palette.slate[100],
  },
  primary: {
    background: palette.primary[50],
    border: palette.primary[100],
    text: palette.primary[700],
    softText: palette.primary[500],
    icon: palette.primary[700],
    iconBg: palette.primary[100],
  },
  accent: {
    background: palette.accent[50],
    border: palette.accent[100],
    text: palette.accent[700],
    softText: palette.accent[600],
    icon: palette.accent[600],
    iconBg: palette.accent[100],
  },
  blurple: {
    background: palette.blurple[50],
    border: palette.blurple[100],
    text: palette.blurple[700],
    softText: palette.blurple[600],
    icon: palette.blurple[600],
    iconBg: palette.blurple[100],
  },
  success: {
    background: palette.success[50],
    border: palette.success[100],
    text: palette.success[700],
    softText: palette.success[600],
    icon: palette.success[600],
    iconBg: palette.success[100],
  },
  warning: {
    background: palette.warning[50],
    border: palette.warning[100],
    text: palette.warning[700],
    softText: palette.warning[600],
    icon: palette.warning[600],
    iconBg: palette.warning[100],
  },
  danger: {
    background: palette.danger[50],
    border: palette.danger[100],
    text: palette.danger[700],
    softText: palette.danger[600],
    icon: palette.danger[600],
    iconBg: palette.danger[100],
  },
  info: {
    background: palette.info[50],
    border: palette.info[100],
    text: palette.info[700],
    softText: palette.info[600],
    icon: palette.info[600],
    iconBg: palette.info[100],
  },
  executive: {
    background: palette.primary[800],
    border: palette.primary[700],
    text: palette.surface,
    softText: 'rgba(255,255,255,0.78)',
    icon: palette.surface,
    iconBg: 'rgba(255,255,255,0.12)',
  },
  executiveAccent: {
    background: palette.accent[600],
    border: palette.accent[700],
    text: palette.surface,
    softText: 'rgba(255,255,255,0.85)',
    icon: palette.surface,
    iconBg: 'rgba(255,255,255,0.18)',
  },
}

export const TONE_NAMES = Object.keys(tones)

export default tones
