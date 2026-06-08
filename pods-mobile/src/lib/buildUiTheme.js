import { cubicle } from '../theme/cubicle'
import { spacing as baseSpacing, radii as baseRadii } from '../theme/tokens'
import { parseUiPreferences } from './userUiPreferences'

function scaleSpacing(mul) {
  const out = {}
  for (const [k, v] of Object.entries(baseSpacing)) {
    out[k] = Math.round(v * mul)
  }
  return out
}

function shadeHex(hex, amount) {
  const clean = String(hex || '').replace('#', '')
  if (clean.length !== 6) return hex
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  if (amount < 0) {
    const f = 1 + amount
    const h = (v) => Math.round(Math.min(255, Math.max(0, v * f)))
    return `#${h(r).toString(16).padStart(2, '0')}${h(g).toString(16).padStart(2, '0')}${h(b).toString(16).padStart(2, '0')}`
  }
  const f = amount
  const h = (v) => Math.round(Math.min(255, v + (255 - v) * f))
  return `#${h(r).toString(16).padStart(2, '0')}${h(g).toString(16).padStart(2, '0')}${h(b).toString(16).padStart(2, '0')}`
}

/**
 * Web `userUiPreferences` + Cubicle sabitlerinden mobil tema nesnesi.
 */
export function buildUiTheme(rawPrefs) {
  const prefs = parseUiPreferences(rawPrefs)
  const fontScale = prefs.fontScale === 'large' ? 1.08 : 1
  const densityMul = prefs.density === 'compact' ? 0.88 : 1
  const sharp = prefs.cornerStyle === 'sharp'

  const accent = prefs.accentColor
  const brandBlue = prefs.sidebarBg

  return {
    prefs,
    pageBg: prefs.pageBg,
    cardBg: cubicle.cardBg,
    border: cubicle.border,
    accent,
    accentPressed: shadeHex(accent, -0.12),
    brandBlue,
    brandBluePressed: shadeHex(brandBlue, -0.12),
    greenCta: cubicle.greenCta,
    greenCtaPressed: cubicle.greenCtaHover,
    tabActive: accent,
    tabInactive: '#94A3B8',
    tabActiveBg: shadeHex(accent, 0.88),
    tabActiveBorder: shadeHex(accent, 0.55),
    cubicle,
    section: {
      overdue: cubicle.overdueBar,
      today: cubicle.todayBar,
      tomorrow: cubicle.tomorrowBar,
      urgent: cubicle.urgentBar,
    },
    status: {
      onTime: cubicle.statusOnTime,
      overdue: cubicle.statusOverdue,
      waiting: cubicle.statusWaiting,
      todo: cubicle.statusTodo,
      cancelled: cubicle.statusCancelled,
    },
    statusBadge: {
      onTime: { bg: '#dcfce7', text: '#166534', label: 'Aktif' },
      overdue: { bg: '#fee2e2', text: '#991b1b', label: 'Gecikmiş' },
      waiting: { bg: '#ffedd5', text: '#9a3412', label: 'Bekliyor' },
      todo: { bg: '#dbeafe', text: '#1e40af', label: 'Yapılacak' },
      cancelled: { bg: '#f1f5f9', text: '#64748b', label: 'Askıda' },
    },
    fontScale,
    spacing: scaleSpacing(densityMul),
    radii: {
      card: sharp ? baseRadii.md : baseRadii.xl,
      button: sharp ? baseRadii.md : baseRadii.pill,
      sheet: sharp ? baseRadii.lg : baseRadii['2xl'],
      chip: sharp ? baseRadii.sm : baseRadii.pill,
      tabBar: baseRadii['3xl'],
    },
    shadows: {
      card: {
        shadowColor: '#0f172a',
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 2,
      },
    },
  }
}
