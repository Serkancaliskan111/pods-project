import { ChevronDown, MousePointerClick } from 'lucide-react'
import { cn } from '../../../../lib/cn'
import StepStatusPill from './StepStatusPill.jsx'

/** Yatay adım seçici — tıklanabilirlik belirgin */
export default function StepSelectorChip({
  stepNo,
  title,
  status,
  isWorkflowActive = false,
  isSelected = false,
  accent = '#2563EB',
  onClick,
  className,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={cn(
        'group relative flex min-w-[168px] max-w-[220px] shrink-0 flex-col rounded-xl border-2 px-4 py-3 text-left transition-all duration-200',
        'cursor-pointer hover:-translate-y-0.5 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        isSelected
          ? 'bg-white shadow-lg ring-2 ring-offset-2'
          : 'border-slate-200 bg-slate-50/90 hover:border-slate-300 hover:bg-white',
        !isSelected && isWorkflowActive && 'border-slate-300 bg-white',
        className,
      )}
      style={
        isSelected
          ? { borderColor: accent, ringColor: `${accent}55` }
          : isWorkflowActive
            ? { borderColor: `${accent}55` }
            : undefined
      }
    >
      {isSelected ? (
        <span
          className="absolute -bottom-px left-4 right-4 h-1 rounded-t-full"
          style={{ backgroundColor: accent }}
          aria-hidden
        />
      ) : null}

      <span className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'text-[10px] font-bold uppercase tracking-wider',
            isSelected ? 'text-slate-600' : 'text-slate-400',
          )}
        >
          Adım {stepNo}
        </span>
        {isWorkflowActive ? (
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white shadow-sm"
            style={{ backgroundColor: accent }}
          >
            Aktif
          </span>
        ) : null}
      </span>

      <span className="mt-1.5 truncate text-sm font-extrabold text-primary-900">{title}</span>
      <StepStatusPill status={status} className="mt-2" />

      <span
        className={cn(
          'mt-2.5 flex items-center gap-1 text-[10px] font-bold transition-colors',
          isSelected ? 'text-slate-600' : 'text-slate-400 group-hover:text-slate-600',
        )}
        style={isSelected ? { color: accent } : undefined}
      >
        <MousePointerClick size={12} className="shrink-0 opacity-80" aria-hidden />
        {isSelected ? 'Kanıtlar açık' : 'Kanıtları göster'}
        <ChevronDown
          size={14}
          className={cn('ml-auto shrink-0 transition-transform', isSelected && 'rotate-180')}
          aria-hidden
        />
      </span>
    </button>
  )
}
