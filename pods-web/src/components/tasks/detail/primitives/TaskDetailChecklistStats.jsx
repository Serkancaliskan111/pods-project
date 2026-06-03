import { CheckCircle2, ClipboardList, XCircle } from 'lucide-react'
import { cn } from '../../../../lib/cn'

export default function TaskDetailChecklistStats({ ctx, design }) {
  const { checklistItems, getChecklistDecision } = ctx
  const total = checklistItems?.length || 0
  const accepted = (checklistItems || []).filter((i) => getChecklistDecision(i) === 'accept').length
  const rejected = (checklistItems || []).filter((i) => getChecklistDecision(i) === 'reject').length
  const pending = total - accepted - rejected
  const accent = design?.accent || '#7C3AED'

  const cards = [
    { label: 'Toplam madde', value: total, icon: ClipboardList, tone: 'slate' },
    { label: 'Kabul', value: accepted, icon: CheckCircle2, tone: 'success' },
    { label: 'Red / bekleyen', value: rejected + pending, icon: XCircle, tone: 'warn' },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map(({ label, value, icon: Icon, tone }) => (
        <div
          key={label}
          className={cn(
            'rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(15,23,42,0.06)]',
            tone === 'success' && 'border-emerald-200/80',
            tone === 'warn' && value > 0 && 'border-amber-200/80',
          )}
        >
          <div className="flex items-center justify-between">
            <Icon
              size={18}
              className={cn(
                tone === 'success' && 'text-emerald-600',
                tone === 'warn' && 'text-amber-600',
                tone === 'slate' && 'text-slate-400',
              )}
              style={tone === 'slate' ? { color: accent } : undefined}
            />
            <span className="text-2xl font-extrabold tabular-nums text-primary-900">{value}</span>
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-500">{label}</p>
        </div>
      ))}
    </div>
  )
}
