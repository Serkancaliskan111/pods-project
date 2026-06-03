import { Calendar, User, UserPlus } from 'lucide-react'
import { cn } from '../../../lib/cn'
import Text from '../../../ui/Text'

const ICONS = {
  assignee: User,
  assigner: UserPlus,
  start: Calendar,
  end: Calendar,
}

export default function TaskDetailMetaGrid({ items = [] }) {
  if (!items.length) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map(({ key, label, value, icon = 'assignee' }) => {
        const Icon = ICONS[icon] || User
        return (
          <div
            key={key || label}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3.5 py-3"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm">
                <Icon size={15} strokeWidth={2} />
              </span>
              <Text variant="caption" className="font-semibold text-slate-500">
                {label}
              </Text>
            </div>
            <Text variant="body" className={cn('shrink-0 text-right font-semibold text-slate-900')}>
              {value}
            </Text>
          </div>
        )
      })}
    </div>
  )
}
