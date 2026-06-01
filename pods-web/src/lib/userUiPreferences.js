import { cubicle } from '../theme/cubicle'

const STORAGE_PREFIX = 'pods_ui_prefs:'

export const UI_PREFS_VERSION = 2

export const SIDEBAR_COLOR_PRESETS = [
  { id: 'pods-blue', label: 'Pods mavi', color: '#2563EB' },
  { id: 'navy', label: 'Lacivert', color: '#0B244A' },
  { id: 'indigo', label: 'İndigo', color: '#4F46E5' },
  { id: 'teal', label: 'Teal', color: '#0D9488' },
  { id: 'emerald', label: 'Zümrüt', color: '#059669' },
  { id: 'slate', label: 'Gri', color: '#475569' },
  { id: 'violet', label: 'Mor', color: '#7C3AED' },
  { id: 'amber', label: 'Kehribar', color: '#D97706' },
]

export const ACCENT_COLOR_PRESETS = [
  { id: 'pods-orange', label: 'Turuncu', color: '#FF500B' },
  { id: 'coral', label: 'Mercan', color: '#F97316' },
  { id: 'rose', label: 'Gül', color: '#E11D48' },
  { id: 'violet', label: 'Mor', color: '#7C3AED' },
  { id: 'sky', label: 'Gök', color: '#0EA5E9' },
  { id: 'mint', label: 'Nane', color: '#10B981' },
]

export const PAGE_BG_PRESETS = [
  { id: 'cool', label: 'Soğuk gri', color: '#EEF1F5' },
  { id: 'neutral', label: 'Nötr', color: '#F4F4F5' },
  { id: 'warm', label: 'Sıcak', color: '#F5F0EB' },
  { id: 'paper', label: 'Kağıt', color: '#FAFAF8' },
  { id: 'mist', label: 'Sis mavisi', color: '#E8EEF4' },
]

export const DENSITY_OPTIONS = [
  { id: 'comfortable', label: 'Rahat' },
  { id: 'compact', label: 'Kompakt' },
]

export const FONT_SCALE_OPTIONS = [
  { id: 'default', label: 'Normal' },
  { id: 'large', label: 'Büyük' },
]

export const CORNER_OPTIONS = [
  { id: 'soft', label: 'Yumuşak' },
  { id: 'sharp', label: 'Keskin' },
]

/** @typedef {'comfortable'|'compact'} DensityId */
/** @typedef {'default'|'large'} FontScaleId */
/** @typedef {'soft'|'sharp'} CornerStyleId */
/**
 * @typedef {Object} UiPreferences
 * @property {string} sidebarBg
 * @property {string} accentColor
 * @property {string} pageBg
 * @property {DensityId} density
 * @property {FontScaleId} fontScale
 * @property {CornerStyleId} cornerStyle
 * @property {number} version
 */

export const DEFAULT_UI_PREFS = /** @type {UiPreferences} */ ({
  sidebarBg: cubicle.sidebarBg,
  accentColor: '#FF500B',
  pageBg: cubicle.pageBg,
  density: 'comfortable',
  fontScale: 'default',
  cornerStyle: 'soft',
  version: UI_PREFS_VERSION,
})

export const DEFAULT_SIDEBAR_BG = DEFAULT_UI_PREFS.sidebarBg

export const pageSurfaceStyle = {
  backgroundColor: 'var(--cubicle-page-bg, #EEF1F5)',
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

/** @param {string} raw */
export function normalizeHexColor(raw) {
  const s = String(raw || '').trim()
  const m = /^#?([0-9a-fA-F]{6})$/.exec(s)
  if (!m) return null
  return `#${m[1].toUpperCase()}`
}

/** @param {unknown} value @param {readonly string[]} allowed @param {string} fallback */
function pickEnum(value, allowed, fallback) {
  const v = String(value || '').trim()
  return allowed.includes(v) ? v : fallback
}

/** @param {unknown} raw @returns {UiPreferences} */
export function parseUiPreferences(raw) {
  let obj = raw
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw)
    } catch {
      obj = null
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ...DEFAULT_UI_PREFS }
  }

  return {
    sidebarBg: normalizeHexColor(obj.sidebarBg) || DEFAULT_UI_PREFS.sidebarBg,
    accentColor: normalizeHexColor(obj.accentColor) || DEFAULT_UI_PREFS.accentColor,
    pageBg: normalizeHexColor(obj.pageBg) || DEFAULT_UI_PREFS.pageBg,
    density: /** @type {DensityId} */ (
      pickEnum(obj.density, ['comfortable', 'compact'], DEFAULT_UI_PREFS.density)
    ),
    fontScale: /** @type {FontScaleId} */ (
      pickEnum(obj.fontScale, ['default', 'large'], DEFAULT_UI_PREFS.fontScale)
    ),
    cornerStyle: /** @type {CornerStyleId} */ (
      pickEnum(obj.cornerStyle, ['soft', 'sharp'], DEFAULT_UI_PREFS.cornerStyle)
    ),
    version: UI_PREFS_VERSION,
  }
}

function hexToRgb(hex) {
  const n = normalizeHexColor(hex)
  if (!n) return { r: 37, g: 99, b: 235 }
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  }
}

function rgbToHex(r, g, b) {
  const h = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase()
}

/** @param {string} hex @param {number} amount */
function shadeHex(hex, amount) {
  const { r, g, b } = hexToRgb(hex)
  if (amount < 0) {
    const f = 1 + amount
    return rgbToHex(r * f, g * f, b * f)
  }
  const f = amount
  return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f)
}

/** @param {UiPreferences|unknown} prefs */
export function resolveSidebarCssVars(prefs) {
  const parsed = parseUiPreferences(prefs)
  const bg = parsed.sidebarBg
  return {
    '--cubicle-sidebar-bg': bg,
    '--cubicle-sidebar-active-bg': cubicle.sidebarActiveBg,
    '--cubicle-sidebar-active-text': shadeHex(bg, -0.22),
    '--cubicle-sidebar-brand-ring': bg,
  }
}

/** @param {UiPreferences|unknown} prefs */
export function resolveUiCssVars(prefs) {
  const parsed = parseUiPreferences(prefs)
  const accent = parsed.accentColor
  return {
    ...resolveSidebarCssVars(parsed),
    '--cubicle-page-bg': parsed.pageBg,
    '--pods-accent-500': accent,
    '--pods-accent-600': shadeHex(accent, -0.12),
    '--pods-accent-shadow': `${accent}47`,
    '--pods-radius-card': parsed.cornerStyle === 'sharp' ? '12px' : '20px',
    '--pods-radius-button': parsed.cornerStyle === 'sharp' ? '10px' : '9999px',
  }
}

/** @param {UiPreferences|unknown} prefs */
export function applyDocumentUiTheme(prefs) {
  if (typeof document === 'undefined') return
  const parsed = parseUiPreferences(prefs)
  const root = document.documentElement
  const vars = resolveUiCssVars(parsed)
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
  root.dataset.podsDensity = parsed.density
  root.dataset.podsFont = parsed.fontScale
  root.dataset.podsCorners = parsed.cornerStyle
}

/** @deprecated use applyDocumentUiTheme */
export function applyDocumentSidebarTheme(prefs) {
  applyDocumentUiTheme(prefs)
}

/** @param {UiPreferences} a @param {UiPreferences} b */
export function uiPreferencesEqual(a, b) {
  const pa = parseUiPreferences(a)
  const pb = parseUiPreferences(b)
  return (
    pa.sidebarBg === pb.sidebarBg &&
    pa.accentColor === pb.accentColor &&
    pa.pageBg === pb.pageBg &&
    pa.density === pb.density &&
    pa.fontScale === pb.fontScale &&
    pa.cornerStyle === pb.cornerStyle
  )
}

/** @param {string} userId @param {UiPreferences} prefs */
export function cacheUiPreferencesLocal(userId, prefs) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(parseUiPreferences(prefs)))
  } catch {
    // ignore
  }
}

/** @param {string} userId */
export function readCachedUiPreferences(userId) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`)
    if (!raw) return null
    return parseUiPreferences(JSON.parse(raw))
  } catch {
    return null
  }
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase @param {string} userId @param {Partial<UiPreferences>} prefs */
export async function saveUserUiPreferences(supabase, userId, prefs) {
  const normalized = parseUiPreferences(prefs)
  const { error } = await supabase
    .from('kullanicilar')
    .update({ arayuz_tercihleri: normalized })
    .eq('id', userId)
  if (error) throw error
  cacheUiPreferencesLocal(userId, normalized)
  applyDocumentUiTheme(normalized)
  return normalized
}
