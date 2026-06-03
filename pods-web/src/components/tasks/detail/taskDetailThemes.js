import { getGorevModuOption } from '../../../lib/gorevModuOptions.js'
import { getTaskDetailDesign } from './taskDetailDesign.js'

const DEFAULT = {
  accent: '#2563EB',
  accentMuted: '#2563EB18',
  accentBorder: '#2563EB33',
  label: 'Standart görev',
}

export function getTaskDetailTheme(gorevTuru) {
  const d = getTaskDetailDesign(gorevTuru)
  return {
    key: d.key,
    accent: d.accent,
    accentMuted: `${d.accent}12`,
    accentBorder: `${d.accent}28`,
    accentRing: `${d.accent}40`,
    headerGradient: d.heroBg,
    label: d.label,
    sub: d.sub,
  }
}

export const STEP_STATUS_STYLES = {
  onaylandi: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  tamamlandi: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  reddedildi: 'bg-red-100 text-red-800 border-red-200',
  onay_bekliyor: 'bg-amber-100 text-amber-900 border-amber-200',
  aktif: 'bg-cyan-100 text-cyan-900 border-cyan-200',
  default: 'bg-slate-100 text-slate-600 border-slate-200',
}

export function stepStatusClass(durumRaw) {
  const d = String(durumRaw || '').toLowerCase()
  return STEP_STATUS_STYLES[d] || STEP_STATUS_STYLES.default
}

export { DEFAULT as TASK_DETAIL_DEFAULT_THEME }
