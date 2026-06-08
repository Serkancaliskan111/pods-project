import { AlignLeft, Camera, Film } from 'lucide-react'
import { cn } from '../../../lib/cn'
import {
  TODO_MADDE_TIP,
  TODO_MADDE_TIP_OPTIONS,
  normalizeMaddeTip,
  getTodoItemTypeOption,
} from '../../../lib/personalTodoItemTypes.js'

const TYPE_ICONS = {
  [TODO_MADDE_TIP.METIN]: AlignLeft,
  [TODO_MADDE_TIP.FOTO]: Camera,
  [TODO_MADDE_TIP.VIDEO]: Film,
}

export default function TodoItemTypeSegment({ value, onChange, disabled = false, compact = false }) {
  const current = normalizeMaddeTip(value)
  const selected = getTodoItemTypeOption(current)

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      <div
        className={cn(
          'flex gap-1 rounded-xl bg-slate-100 p-1 ring-1 ring-slate-200',
          disabled && 'pointer-events-none opacity-60',
        )}
        role="radiogroup"
        aria-label="Adım tipi"
      >
        {TODO_MADDE_TIP_OPTIONS.map((opt) => {
          const active = current === opt.value
          const Icon = TYPE_ICONS[opt.value]
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={opt.label}
              onClick={() => onChange?.(opt.value)}
              className={cn(
                'inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold transition',
                active
                  ? 'bg-white text-primary-700 shadow-sm ring-1 ring-slate-200/80'
                  : 'text-slate-500 hover:bg-white/60 hover:text-slate-700',
              )}
            >
              <Icon size={14} />
              <span className={compact ? 'truncate' : ''}>{opt.shortLabel}</span>
            </button>
          )
        })}
      </div>
      {!compact ? (
        <p className="text-[11px] leading-snug text-slate-500">{selected.description}</p>
      ) : null}
    </div>
  )
}
