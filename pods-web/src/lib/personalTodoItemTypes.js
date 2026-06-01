export const TODO_MADDE_TIP = {
  METIN: 'metin',
  FOTO: 'foto',
  VIDEO: 'video',
}

export const TODO_MADDE_TIP_OPTIONS = [
  { value: TODO_MADDE_TIP.METIN, label: 'Metin' },
  { value: TODO_MADDE_TIP.FOTO, label: 'Fotoğraf' },
  { value: TODO_MADDE_TIP.VIDEO, label: 'Video' },
]

export function normalizeMaddeTip(raw) {
  const t = String(raw || '').toLowerCase()
  if (t === TODO_MADDE_TIP.FOTO || t === TODO_MADDE_TIP.VIDEO) return t
  return TODO_MADDE_TIP.METIN
}

export function isMediaMaddeTip(tip) {
  return tip === TODO_MADDE_TIP.FOTO || tip === TODO_MADDE_TIP.VIDEO
}

export function maddeTipLabel(tip) {
  return TODO_MADDE_TIP_OPTIONS.find((o) => o.value === tip)?.label || 'Metin'
}

/** Medya maddesi tamamlanabilir mi? */
export function canCompleteMadde(item) {
  if (!isMediaMaddeTip(item?.tip)) return true
  return !!item?.medyaYol
}

export function countPendingMedia(items) {
  return (items || []).filter((m) => isMediaMaddeTip(m.tip) && !m.medyaYol && !m.tamamlandi).length
}
