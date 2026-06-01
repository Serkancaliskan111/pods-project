import { getTaskWorkStatusOption } from '../../lib/taskWorkStatus.js'

export default function TaskWorkStatusBadge({ value, className = '' }) {
  const opt = getTaskWorkStatusOption(value)
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${className}`}
      style={{ backgroundColor: opt.pillBg, color: opt.pillText }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: opt.dot }} aria-hidden />
      {opt.label}
    </span>
  )
}
