export const TASK_WORK_STATUS = {
  WAITING: 'bekliyor',
  ACTIVE: 'aktif',
  COMPLETED: 'tamamlandi',
  ON_HOLD: 'askiya_alindi',
}

export const TASK_WORK_STATUS_OPTIONS = [
  {
    value: TASK_WORK_STATUS.WAITING,
    label: 'Bekliyor',
    dot: '#F5A623',
    pillBg: '#fef9c3',
    pillText: '#854d0e',
  },
  {
    value: TASK_WORK_STATUS.ACTIVE,
    label: 'Aktif',
    dot: '#3CB878',
    pillBg: '#dcfce7',
    pillText: '#166534',
  },
  {
    value: TASK_WORK_STATUS.COMPLETED,
    label: 'Tamamlandı',
    dot: '#94A3B8',
    pillBg: '#e0f2fe',
    pillText: '#0c4a6e',
  },
  {
    value: TASK_WORK_STATUS.ON_HOLD,
    label: 'Askıya Alındı',
    dot: '#A855F7',
    pillBg: '#f3e8ff',
    pillText: '#6b21a8',
  },
]

const BY_VALUE = new Map(TASK_WORK_STATUS_OPTIONS.map((o) => [o.value, o]))

export function normalizeTaskWorkStatus(raw) {
  const v = String(raw || TASK_WORK_STATUS.WAITING).toLowerCase().trim()
  return BY_VALUE.has(v) ? v : TASK_WORK_STATUS.WAITING
}

export function getTaskWorkStatusOption(raw) {
  return BY_VALUE.get(normalizeTaskWorkStatus(raw)) || BY_VALUE.get(TASK_WORK_STATUS.WAITING)
}

export function taskWorkStatusLabel(raw) {
  return getTaskWorkStatusOption(raw).label
}
