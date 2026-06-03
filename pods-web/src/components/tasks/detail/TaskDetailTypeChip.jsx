import { cn } from '../../../lib/cn'
import { getTaskTypePresentation } from './taskDetailConfig.js'

/** Başlık satırında kompakt görev türü rozeti */
export default function TaskDetailTypeChip({ gorevTuru, activeStepNo, totalSteps, className }) {
  const { label, color, Icon } = getTaskTypePresentation(gorevTuru)
  const isNormal = String(gorevTuru || 'normal') === 'normal'
  if (isNormal) return null

  const progress =
    totalSteps > 0 && activeStepNo > 0 ? ` · ${activeStepNo}/${totalSteps}` : ''

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm',
        className,
      )}
      style={{
        borderColor: `${color}35`,
        backgroundColor: `${color}10`,
        color,
      }}
    >
      <Icon size={12} strokeWidth={2.25} className="shrink-0" />
      <span className="truncate">
        {label}
        {progress}
      </span>
    </span>
  )
}
