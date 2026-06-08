export function getTaskTypeLabel(taskType) {
  const value = String(taskType || '').trim()
  if (!value) return '-'
  const labels = {
    normal: 'Normal',
    sablon_gorev: 'Şablon Görev',
    zincir_gorev: 'Zincir Görev',
    zincir_onay: 'Zincir Onay',
    zincir_gorev_ve_onay: 'Zincir Görev + Onay',
    sirali_gorev: 'Sıralı Görev',
  }
  if (labels[value]) return labels[value]
  return value
    .replaceAll('_', ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase())
}

/** Liste kartları — şablon / proje görev türünü tek yerden çöz */
export function resolveTaskTypeLabel(task) {
  if (!task) return '-'
  if (task.is_sablon_id && !String(task.gorev_turu || '').trim()) {
    return getTaskTypeLabel('sablon_gorev')
  }
  return getTaskTypeLabel(task.gorev_turu || 'normal')
}

export function getTaskTypeKey(task) {
  if (!task) return 'normal'
  if (task.is_sablon_id && !String(task.gorev_turu || '').trim()) return 'sablon_gorev'
  return String(task.gorev_turu || 'normal').trim() || 'normal'
}
