/**
 * Bold Productivity — web panel renk paleti (mobil ile senkron).
 */
export const palette = {
  primary: {
    50: '#EEF1F7',
    100: '#D7DFEA',
    200: '#A9B7CE',
    300: '#7488A6',
    400: '#445C82',
    500: '#1F345D',
    600: '#0B244A',
    700: '#051B3F',
    800: '#03132E',
    900: '#01091A',
  },
  accent: {
    50: '#FFF1EA',
    100: '#FFDAC6',
    200: '#FFB48E',
    300: '#FF8852',
    400: '#FF6A2E',
    500: '#FF500B',
    600: '#E13F00',
    700: '#B53300',
    800: '#822400',
    900: '#511500',
  },
  blurple: {
    50: '#EFEEFF',
    100: '#D6D3FF',
    200: '#ADA8FF',
    300: '#857DFF',
    400: '#6E66FF',
    500: '#635BFF',
    600: '#4F47E5',
    700: '#3A33B5',
    800: '#252082',
    900: '#13105A',
  },
  slate: {
    50: '#F1F4F8',
    100: '#DDE3EC',
    200: '#BCC6D6',
    300: '#94A1B6',
    400: '#6C7A91',
    500: '#425466',
    600: '#324052',
    700: '#23303F',
    800: '#16202B',
    900: '#0B121A',
  },
  success: {
    50: '#ECFDF3',
    100: '#D1FADF',
    200: '#A6F4C5',
    500: '#12B76A',
    600: '#039855',
    700: '#027A48',
  },
  warning: {
    50: '#FFFAEB',
    100: '#FEF0C7',
    200: '#FEDF89',
    500: '#F79009',
    600: '#DC6803',
    700: '#B54708',
  },
  danger: {
    50: '#FEF3F2',
    100: '#FEE4E2',
    200: '#FECDCA',
    500: '#F04438',
    600: '#D92D20',
    700: '#B42318',
  },
  info: {
    50: '#EFF6FF',
    100: '#D7E5FF',
    200: '#B2D0FE',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
  },
  surface: '#FFFFFF',
  background: '#F1F4F8',
  overlay: 'rgba(5,27,63,0.55)',
  overlayLight: 'rgba(5,27,63,0.32)',
  overlayHeavy: 'rgba(5,27,63,0.72)',
}

export function hexToRgba(hex, alpha = 1) {
  const clean = hex.replace('#', '')
  const bigint = parseInt(
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean,
    16,
  )
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${r},${g},${b},${a})`
}

export default palette
