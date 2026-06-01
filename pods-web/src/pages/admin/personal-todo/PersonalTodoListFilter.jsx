import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../../../lib/cn'

export const PERSONAL_TODO_FILTERS = [
  { id: 'yapilacak', label: 'Yapılacaklar', dotClass: 'bg-primary-600' },
  { id: 'bugun', label: 'Bugün', dotClass: 'bg-sky-500' },
  { id: 'gecikmis', label: 'Planı geçen', dotClass: 'bg-red-500' },
  { id: 'tamamlanan', label: 'Tamamlanan', dotClass: 'bg-emerald-500' },
  { id: 'denetimde', label: 'Denetimde', dotClass: 'bg-amber-500' },
]

function useDropdownPosition(open, anchorRef) {
  const [style, setStyle] = useState(null)

  const update = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const gap = 6
    const maxH = 280
    const spaceBelow = window.innerHeight - rect.bottom - gap
    const spaceAbove = rect.top - gap
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow
    const maxHeight = Math.min(maxH, openUp ? spaceAbove - 8 : spaceBelow - 8)

    setStyle({
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(160, maxHeight),
      top: openUp ? undefined : rect.bottom + gap,
      bottom: openUp ? window.innerHeight - rect.top + gap : undefined,
    })
  }, [anchorRef])

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null)
      return
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, update])

  return style
}

export default function PersonalTodoListFilter({ value, onChange, counts }) {
  const anchorRef = useRef(null)
  const panelRef = useRef(null)
  const [open, setOpen] = useState(false)
  const panelStyle = useDropdownPosition(open, anchorRef)

  const active = useMemo(
    () => PERSONAL_TODO_FILTERS.find((f) => f.id === value) || PERSONAL_TODO_FILTERS[0],
    [value],
  )
  const activeCount = counts?.[value] ?? 0

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointer = (e) => {
      const t = e.target
      if (anchorRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open])

  const select = (id) => {
    onChange(id)
    setOpen(false)
  }

  const panel =
    open && panelStyle && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            id="personal-todo-filter-listbox"
            role="listbox"
            aria-label="Liste filtresi"
            className="fixed z-[10050] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.18)]"
            style={{
              left: panelStyle.left,
              width: panelStyle.width,
              maxHeight: panelStyle.maxHeight,
              top: panelStyle.top,
              bottom: panelStyle.bottom,
            }}
          >
            <ul className="max-h-[inherit] overflow-y-auto overscroll-contain py-1">
              {PERSONAL_TODO_FILTERS.map((f) => {
                const selected = value === f.id
                const n = counts?.[f.id] ?? 0
                return (
                  <li key={f.id} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      onClick={() => select(f.id)}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition',
                        selected
                          ? 'bg-primary-50 font-semibold text-primary-900'
                          : 'text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      <span
                        className={cn('h-2 w-2 shrink-0 rounded-full', f.dotClass)}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{f.label}</span>
                      <span
                        className={cn(
                          'shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums',
                          selected ? 'bg-primary-100 text-primary-800' : 'bg-slate-100 text-slate-600',
                        )}
                      >
                        {n}
                      </span>
                      {selected ? (
                        <Check size={16} className="shrink-0 text-primary-700" strokeWidth={2.5} />
                      ) : (
                        <span className="w-4 shrink-0" aria-hidden />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>,
          document.body,
        )
      : null

  return (
    <div ref={anchorRef} className="relative">
      <button
        type="button"
        id="personal-todo-filter-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? 'personal-todo-filter-listbox' : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-left shadow-sm transition',
          open
            ? 'border-primary-400 ring-2 ring-primary-100'
            : 'border-slate-200 hover:border-slate-300',
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Liste filtresi
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-slate-900">{active.label}</span>
            <span className="shrink-0 text-xs font-bold tabular-nums text-slate-500">{activeCount}</span>
          </span>
        </span>
        <ChevronDown
          size={18}
          className={cn('shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {panel}
    </div>
  )
}
