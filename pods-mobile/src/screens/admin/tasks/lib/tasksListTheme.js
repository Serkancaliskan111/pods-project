import { cubicle } from '../../../../theme/cubicle'
import { TASK_STATUS, normalizeTaskStatus } from '../../../../lib/taskStatus'

/** Web `TaskTimeAccordion` ile aynı bölüm renkleri */
export const TASK_SECTION_COLORS = {
  today: cubicle.todayBar,
  tomorrow: cubicle.tomorrowBar,
  yesterday: '#8B5CF6',
  week: '#6366F1',
  last7: '#6366F1',
  other: '#64748B',
}

/** Web görev listesi filtre / CTA mavisi */
export const TASK_LIST_BRAND = cubicle.sidebarBg

export const INFO_TILE_VISUALS = {
  assigner: {
    bg: '#EEF2FF',
    border: '#C7D2FE',
    iconBg: '#E0E7FF',
    icon: '#4F46E5',
    label: '#6366F1',
    text: '#312E81',
  },
  date: {
    bg: '#FFF7ED',
    border: '#FED7AA',
    iconBg: '#FFEDD5',
    icon: '#EA580C',
    label: '#C2410C',
    text: '#7C2D12',
  },
  dateOverdue: {
    bg: '#FEF2F2',
    border: '#FECACA',
    iconBg: '#FEE2E2',
    icon: '#DC2626',
    label: '#B91C1C',
    text: '#7F1D1D',
  },
}

export function resolveStatusTileVisual(durum, deletionPending) {
  if (deletionPending) {
    return {
      bg: '#FFFBEB',
      border: '#FDE68A',
      iconBg: '#FEF3C7',
      icon: '#D97706',
      label: '#B45309',
      text: '#92400E',
      value: cubicle.statusWaiting,
    }
  }
  const d = normalizeTaskStatus(durum)
  if (d === TASK_STATUS.APPROVED) {
    return {
      bg: '#ECFDF5',
      border: '#A7F3D0',
      iconBg: '#D1FAE5',
      icon: '#059669',
      label: '#047857',
      text: '#064E3B',
      value: cubicle.statusOnTime,
    }
  }
  if (d === TASK_STATUS.REJECTED) {
    return {
      bg: '#FEF2F2',
      border: '#FECACA',
      iconBg: '#FEE2E2',
      icon: '#DC2626',
      label: '#B91C1C',
      text: '#7F1D1D',
      value: cubicle.statusOverdue,
    }
  }
  if (d === TASK_STATUS.PENDING_APPROVAL || d === TASK_STATUS.RESUBMITTED) {
    return {
      bg: '#FFFBEB',
      border: '#FDE68A',
      iconBg: '#FEF3C7',
      icon: '#D97706',
      label: '#B45309',
      text: '#92400E',
      value: cubicle.statusWaiting,
    }
  }
  return {
    bg: '#EFF6FF',
    border: '#BFDBFE',
    iconBg: '#DBEAFE',
    icon: '#2563EB',
    label: '#1D4ED8',
    text: '#1E3A8A',
    value: cubicle.statusTodo,
  }
}
