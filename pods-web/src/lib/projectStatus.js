/** Proje ve proje görevi durum sabitleri */

export const PROJECT_STATUS = {
  PLANNING: 'planlama',
  ACTIVE: 'devam',
  DONE: 'tamamlandi',
  ON_HOLD: 'beklemede',
  CANCELLED: 'iptal',
}

export const PROJECT_PRIORITY = {
  LOW: 'dusuk',
  NORMAL: 'normal',
  HIGH: 'yuksek',
  CRITICAL: 'kritik',
}

export const PROJECT_TASK_STATUS = {
  TODO: 'yapilacak',
  IN_PROGRESS: 'devam',
  DONE: 'tamamlandi',
  BLOCKED: 'bloke',
}

export const PROJECT_STATUS_OPTIONS = [
  { value: PROJECT_STATUS.PLANNING, label: 'Planlama', tone: 'info' },
  { value: PROJECT_STATUS.ACTIVE, label: 'Devam ediyor', tone: 'success' },
  { value: PROJECT_STATUS.DONE, label: 'Tamamlandı', tone: 'neutral' },
  { value: PROJECT_STATUS.ON_HOLD, label: 'Beklemede', tone: 'warning' },
  { value: PROJECT_STATUS.CANCELLED, label: 'İptal', tone: 'danger' },
]

export const PROJECT_PRIORITY_OPTIONS = [
  { value: PROJECT_PRIORITY.LOW, label: 'Düşük' },
  { value: PROJECT_PRIORITY.NORMAL, label: 'Normal' },
  { value: PROJECT_PRIORITY.HIGH, label: 'Yüksek' },
  { value: PROJECT_PRIORITY.CRITICAL, label: 'Kritik' },
]

export const PROJECT_TASK_STATUS_OPTIONS = [
  { value: PROJECT_TASK_STATUS.TODO, label: 'Yapılacak', color: '#64748B', bg: '#F1F5F9' },
  { value: PROJECT_TASK_STATUS.IN_PROGRESS, label: 'Devam', color: '#2563EB', bg: '#DBEAFE' },
  { value: PROJECT_TASK_STATUS.DONE, label: 'Tamamlandı', color: '#059669', bg: '#D1FAE5' },
  { value: PROJECT_TASK_STATUS.BLOCKED, label: 'Bloke', color: '#DC2626', bg: '#FEE2E2' },
]

export function getProjectStatusOption(value) {
  return PROJECT_STATUS_OPTIONS.find((o) => o.value === value) || PROJECT_STATUS_OPTIONS[0]
}

export function getProjectTaskStatusOption(value) {
  return PROJECT_TASK_STATUS_OPTIONS.find((o) => o.value === value) || PROJECT_TASK_STATUS_OPTIONS[0]
}

export const PROJECT_COLOR_PRESETS = [
  '#2563EB',
  '#7C3AED',
  '#059669',
  '#D97706',
  '#DC2626',
  '#0D9488',
  '#4F46E5',
  '#E11D48',
]
