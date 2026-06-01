import { palette } from './palette'

/** Tailwind class maps per typography variant */
export const typographyClasses = {
  displayLg: 'text-[32px] leading-[38px] font-extrabold tracking-[-0.6px] text-slate-800',
  displayMd: 'text-[26px] leading-[32px] font-bold tracking-[-0.5px] text-slate-800',
  h1: 'text-[22px] leading-7 font-bold tracking-[-0.4px] text-slate-800',
  h2: 'text-lg leading-6 font-semibold tracking-[-0.3px] text-slate-800',
  h3: 'text-base leading-[22px] font-semibold text-slate-800',
  bodyLg: 'text-[15px] leading-[22px] font-medium text-slate-800',
  body: 'text-sm leading-5 font-medium text-slate-800',
  bodySm: 'text-[13px] leading-[18px] font-medium text-slate-800',
  caption: 'text-xs leading-4 font-semibold text-slate-500',
  overline: 'text-[11px] leading-[14px] font-bold uppercase tracking-[0.08em] text-slate-500',
  metric: 'text-[28px] leading-8 font-extrabold tracking-[-0.6px] text-slate-800',
  metricSm: 'text-xl leading-6 font-bold tracking-[-0.4px] text-slate-800',
}

export const typography = {
  displayLg: { fontSize: 32, lineHeight: 38, fontWeight: 800, letterSpacing: -0.6, color: palette.slate[800] },
  displayMd: { fontSize: 26, lineHeight: 32, fontWeight: 700, letterSpacing: -0.5, color: palette.slate[800] },
  h1: { fontSize: 22, lineHeight: 28, fontWeight: 700, letterSpacing: -0.4, color: palette.slate[800] },
  h2: { fontSize: 18, lineHeight: 24, fontWeight: 600, letterSpacing: -0.3, color: palette.slate[800] },
  h3: { fontSize: 16, lineHeight: 22, fontWeight: 600, color: palette.slate[800] },
  bodyLg: { fontSize: 15, lineHeight: 22, fontWeight: 500, color: palette.slate[800] },
  body: { fontSize: 14, lineHeight: 20, fontWeight: 500, color: palette.slate[800] },
  bodySm: { fontSize: 13, lineHeight: 18, fontWeight: 500, color: palette.slate[800] },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: 600, color: palette.slate[500] },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: palette.slate[500] },
  metric: { fontSize: 28, lineHeight: 32, fontWeight: 800, letterSpacing: -0.6, color: palette.slate[800] },
  metricSm: { fontSize: 20, lineHeight: 24, fontWeight: 700, letterSpacing: -0.4, color: palette.slate[800] },
}

export default typography
