import { normalizeStepStatus } from '../../../../lib/taskStatus.js'
import { cn } from '../../../../lib/cn'
import { stepStatusClass } from '../taskDetailThemes.js'

export default function StepStatusPill({ status, className }) {
  const raw = String(status || '').toLowerCase()
  const label = normalizeStepStatus(status) || '—'
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold',
        stepStatusClass(raw),
        className,
      )}
    >
      {label}
    </span>
  )
}
