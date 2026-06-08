import AsyncStorage from '@react-native-async-storage/async-storage'
import { cubicle } from '../theme/cubicle'
import { palette } from '../theme/palette'

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

export const DEFAULT_UI_PREFS = {
  sidebarBg: cubicle.sidebarBg,
  accentColor: palette.accent[500],
  pageBg: cubicle.pageBg,
  density: 'comfortable',
  fontScale: 'default',
  cornerStyle: 'soft',
  version: UI_PREFS_VERSION,
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

export function normalizeHexColor(raw) {
  const s = String(raw || '').trim()
  const m = /^#?([0-9a-fA-F]{6})$/.exec(s)
  if (!m) return null
  return `#${m[1].toUpperCase()}`
}

function pickEnum(value, allowed, fallback) {
  const v = String(value || '').trim()
  return allowed.includes(v) ? v : fallback
}

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
    density: pickEnum(obj.density, ['comfortable', 'compact'], DEFAULT_UI_PREFS.density),
    fontScale: pickEnum(obj.fontScale, ['default', 'large'], DEFAULT_UI_PREFS.fontScale),
    cornerStyle: pickEnum(obj.cornerStyle, ['soft', 'sharp'], DEFAULT_UI_PREFS.cornerStyle),
    version: UI_PREFS_VERSION,
  }
}

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

export async function cacheUiPreferencesLocal(userId, prefs) {
  try {
    await AsyncStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(parseUiPreferences(prefs)))
  } catch {
    // ignore
  }
}

export async function readCachedUiPreferences(userId) {
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${userId}`)
    if (!raw) return null
    return parseUiPreferences(JSON.parse(raw))
  } catch {
    return null
  }
}

/** Mobil: tercihleri uygulanabilir tema objesine çevirir */
export function resolveMobileThemeFromPrefs(prefs) {
  const p = parseUiPreferences(prefs)
  return {
    pageBackground: p.pageBg,
    accent: p.accentColor,
    sidebar: p.sidebarBg,
    density: p.density,
    fontScale: p.fontScale,
    cornerStyle: p.cornerStyle,
  }
}

export async function saveUserUiPreferences(supabase, userId, prefs) {
  const normalized = parseUiPreferences(prefs)
  const { error } = await supabase
    .from('kullanicilar')
    .update({ arayuz_tercihleri: normalized })
    .eq('id', userId)
  if (error) throw error
  await cacheUiPreferencesLocal(userId, normalized)
  return normalized
}
