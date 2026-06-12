export function getTaskTypeLabel(taskType) {
  const value = String(taskType || '').trim()
  if (!value) return '-'
  const labels = {
    normal: 'Standart görev',
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

/** Liste kartı ikonları — canlı renk paleti */
export const TASK_TYPE_VISUALS = {
  normal: {
    bg: '#DBEAFE',
    border: '#93C5FD',
    icon: '#1D4ED8',
    iconBg: '#BFDBFE',
    shadow: '#2563EB33',
  },
  sablon_gorev: {
    bg: '#EDE9FE',
    border: '#C4B5FD',
    icon: '#6D28D9',
    iconBg: '#DDD6FE',
    shadow: '#7C3AED33',
  },
  zincir_gorev: {
    bg: '#FFEDD5',
    border: '#FDBA74',
    icon: '#C2410C',
    iconBg: '#FED7AA',
    shadow: '#EA580C33',
  },
  zincir_onay: {
    bg: '#FEF3C7',
    border: '#FCD34D',
    icon: '#B45309',
    iconBg: '#FDE68A',
    shadow: '#D9770633',
  },
  zincir_gorev_ve_onay: {
    bg: '#CFFAFE',
    border: '#67E8F9',
    icon: '#0E7490',
    iconBg: '#A5F3FC',
    shadow: '#0891B233',
  },
  sirali_gorev: {
    bg: '#DCFCE7',
    border: '#86EFAC',
    icon: '#15803D',
    iconBg: '#BBF7D0',
    shadow: '#16A34A33',
  },
}

/** Liste kartı ikonları — tone UI kit ile eşleşir (geriye dönük) */
export function resolveTaskTypeMeta(task) {
  const key = getTaskTypeKey(task)
  const label = resolveTaskTypeLabel(task)
  const toneByKey = {
    normal: 'info',
    sablon_gorev: 'blurple',
    zincir_gorev: 'accent',
    zincir_onay: 'warning',
    zincir_gorev_ve_onay: 'primary',
    sirali_gorev: 'success',
  }
  return { key, label, tone: toneByKey[key] || 'slate' }
}

export function resolveTaskTypeVisual(task) {
  const key = getTaskTypeKey(task)
  const label = resolveTaskTypeLabel(task)
  return {
    key,
    label,
    ...(TASK_TYPE_VISUALS[key] || TASK_TYPE_VISUALS.normal),
  }
}
