export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed'

export const labelClass =
  'text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500'

export const fieldClass = 'flex flex-col gap-1.5'

export function formatDateTimeLocalInput(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}`
}

export function localInputToIso(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const dt = new Date(raw)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString()
}

export function personName(p) {
  if (!p) return ''
  const n = [p.ad, p.soyad].filter(Boolean).join(' ').trim()
  return n || p.email || String(p.id)
}
