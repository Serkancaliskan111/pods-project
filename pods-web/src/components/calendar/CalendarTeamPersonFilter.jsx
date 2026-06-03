import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, UserPlus2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { personRowDisplayName } from '../../lib/calendarTeamMembers.js'

const PANEL_Z = 10050
const MAX_STACK = 3

const AVATAR_TONES = [
  { bg: 'bg-indigo-100', text: 'text-indigo-700', ring: 'ring-indigo-200' },
  { bg: 'bg-sky-100', text: 'text-sky-700', ring: 'ring-sky-200' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', ring: 'ring-emerald-200' },
  { bg: 'bg-violet-100', text: 'text-violet-700', ring: 'ring-violet-200' },
  { bg: 'bg-amber-100', text: 'text-amber-800', ring: 'ring-amber-200' },
  { bg: 'bg-rose-100', text: 'text-rose-700', ring: 'ring-rose-200' },
]

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return (parts[0].slice(0, 2) || '?').toUpperCase()
  return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase()
}

function avatarTone(name) {
  let h = 0
  const s = String(name || '')
  for (let i = 0; i < s.length; i += 1) h = (h + s.charCodeAt(i)) % AVATAR_TONES.length
  return AVATAR_TONES[h]
}

function PersonAvatar({ name, size = 'sm', className }) {
  const tone = avatarTone(name)
  const dim = size === 'xs' ? 'h-6 w-6 text-[9px]' : size === 'md' ? 'h-9 w-9 text-xs' : 'h-7 w-7 text-[10px]'
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold ring-2 ring-white',
        dim,
        tone.bg,
        tone.text,
        className,
      )}
      title={name}
    >
      {initials(name)}
    </span>
  )
}

function useDropdownPosition(open, anchorRef) {
  const [style, setStyle] = useState(null)

  const update = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const gap = 8
    const panelW = Math.min(300, Math.max(260, rect.width))
    const maxH = 320
    const spaceBelow = window.innerHeight - rect.bottom - gap
    const spaceAbove = rect.top - gap
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow
    const maxHeight = Math.min(maxH, openUp ? spaceAbove - 12 : spaceBelow - 12)
    let left = rect.right - panelW
    left = Math.max(12, Math.min(left, window.innerWidth - panelW - 12))

    setStyle({
      left,
      width: panelW,
      maxHeight: Math.max(180, maxHeight),
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

export default function CalendarTeamPersonFilter({
  options = [],
  selectedIds = [],
  onChange,
  loading = false,
  className,
}) {
  const anchorRef = useRef(null)
  const panelRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const panelStyle = useDropdownPosition(open, anchorRef)

  const selectedSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds])

  const selectedRows = useMemo(
    () => options.filter((r) => selectedSet.has(String(r.id))),
    [options, selectedSet],
  )

  const filteredOptions = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return options
    return options.filter((row) => personRowDisplayName(row).toLowerCase().includes(term))
  }, [options, search])

  const toggleId = (id) => {
    const sid = String(id)
    if (selectedSet.has(sid)) {
      onChange?.(selectedIds.filter((x) => String(x) !== sid))
    } else {
      onChange?.([...selectedIds, sid])
    }
  }

  const selectAll = () => onChange?.(options.map((r) => String(r.id)))
  const clearAll = () => onChange?.([])

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

  const stackRows = selectedRows.slice(0, MAX_STACK)
  const overflow = Math.max(0, selectedRows.length - MAX_STACK)

  const panel =
    open && panelStyle && options.length && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            id="calendar-team-person-listbox"
            role="listbox"
            aria-multiselectable="true"
            aria-label="Ekip üyeleri"
            className="fixed overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.16)]"
            style={{
              zIndex: PANEL_Z,
              left: panelStyle.left,
              width: panelStyle.width,
              maxHeight: panelStyle.maxHeight,
              top: panelStyle.top,
              bottom: panelStyle.bottom,
            }}
          >
            <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50/90 to-white px-3 py-2.5">
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="İsim ara…"
                  className="w-full rounded-full border-0 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 shadow-sm ring-1 ring-slate-200/80 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  autoFocus
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold tabular-nums text-slate-500">
                  {selectedIds.length} / {options.length} seçili
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-200"
                  >
                    Tümü
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-200"
                  >
                    Temizle
                  </button>
                </div>
              </div>
            </div>

            <ul className="max-h-[inherit] overflow-y-auto overscroll-contain py-1.5">
              {filteredOptions.length ? (
                filteredOptions.map((row) => {
                  const id = String(row.id)
                  const name = personRowDisplayName(row)
                  const checked = selectedSet.has(id)
                  const tone = avatarTone(name)
                  return (
                    <li key={id} role="option" aria-selected={checked}>
                      <button
                        type="button"
                        onClick={() => toggleId(id)}
                        className={cn(
                          'mx-1.5 flex w-[calc(100%-12px)] items-center gap-2.5 rounded-xl px-2 py-2 text-left transition',
                          checked ? 'bg-blue-50/90' : 'hover:bg-slate-50',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                            tone.bg,
                            tone.text,
                          )}
                        >
                          {initials(name)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                          {name}
                        </span>
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition',
                            checked
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-200 bg-white',
                          )}
                        >
                          {checked ? <Check size={12} strokeWidth={3} /> : null}
                        </span>
                      </button>
                    </li>
                  )
                })
              ) : (
                <li className="px-4 py-6 text-center text-xs text-slate-500">Sonuç bulunamadı.</li>
              )}
            </ul>
          </div>,
          document.body,
        )
      : null

  return (
    <div
      ref={anchorRef}
      data-help="calendar-team-picker"
      className={cn('relative inline-flex', className)}
    >
      <button
        type="button"
        disabled={loading || !options.length}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? 'calendar-team-person-listbox' : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex h-9 max-w-[min(100vw-2rem,280px)] items-center gap-2 rounded-full border bg-white pl-1 pr-2.5 shadow-sm transition',
          open
            ? 'border-blue-300 ring-2 ring-blue-100'
            : 'border-slate-200/90 hover:border-slate-300 hover:shadow',
          selectedIds.length > 0 && !open && 'border-blue-200/80',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        {selectedIds.length === 0 ? (
          <span
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500"
            aria-hidden
          >
            <UserPlus2 size={14} />
          </span>
        ) : (
          <span className="flex items-center pl-0.5">
            {stackRows.map((row, i) => (
              <PersonAvatar
                key={row.id}
                name={personRowDisplayName(row)}
                size="sm"
                className={cn(i > 0 && '-ml-2')}
              />
            ))}
            {overflow > 0 ? (
              <span className="-ml-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-white ring-2 ring-white">
                +{overflow}
              </span>
            ) : null}
          </span>
        )}
        <span className="min-w-0 truncate text-xs font-bold text-slate-700">
          {selectedIds.length === 0
            ? 'Ekip seç'
            : selectedIds.length === 1
              ? personRowDisplayName(selectedRows[0])
              : `${selectedIds.length} kişi`}
        </span>
        <ChevronDown
          size={14}
          className={cn('shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {panel}

      {!loading && !options.length ? (
        <span
          className="pointer-events-none absolute -bottom-5 left-0 whitespace-nowrap text-[10px] text-slate-400"
          title="Hiyerarşinizde görüntülenecek ekip üyesi yok"
        >
          Ekip yok
        </span>
      ) : null}
    </div>
  )
}
