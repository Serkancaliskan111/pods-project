import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Takvim / proje Gantt üst çubuğu — aynı gezinme davranışı */
export default function GanttViewToolbar({
  rangeLabel,
  onPrev,
  onNext,
  onToday,
  onRefresh,
  taskCount,
  trailing = null,
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
          aria-label="Önceki"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="min-w-[140px] text-center text-sm font-bold text-slate-800">{rangeLabel}</span>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
          aria-label="Sonraki"
        >
          <ChevronRight size={20} />
        </button>
        <button
          type="button"
          onClick={onToday}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Bugün
        </button>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            className="hidden rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 sm:inline"
          >
            Yenile
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {trailing}
        {typeof taskCount === 'number' ? (
          <span className="text-[11px] font-medium text-slate-400">{taskCount} görev</span>
        ) : null}
      </div>
    </div>
  )
}
