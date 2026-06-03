import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Building2, ChevronDown, ChevronUp, Plus, Search, Trash2, UserCheck, Users, X } from 'lucide-react'
import { cubicle } from '../../theme/cubicle.js'
import { cn } from '../../lib/cn'

const PICKER_Z = 10060
const PANEL_W = 272
const PANEL_MAX_H = 300

const TONES = {
  indigo: {
    ring: 'ring-indigo-100',
    badge: 'bg-indigo-50 text-indigo-800',
    chip: 'border-indigo-100 bg-indigo-50/50',
    avatar: 'bg-indigo-100 text-indigo-700',
  },
  sky: {
    ring: 'ring-sky-100',
    badge: 'bg-sky-50 text-sky-800',
    chip: 'border-sky-100 bg-sky-50/50',
    avatar: 'bg-sky-100 text-sky-700',
  },
  fuchsia: {
    ring: 'ring-fuchsia-100',
    badge: 'bg-fuchsia-50 text-fuchsia-800',
    chip: 'border-fuchsia-100 bg-fuchsia-50/40',
    avatar: 'bg-fuchsia-100 text-fuchsia-700',
  },
  slate: {
    ring: 'ring-slate-100',
    badge: 'bg-slate-100 text-slate-700',
    chip: 'border-slate-200 bg-slate-50/80',
    avatar: 'bg-slate-200 text-slate-700',
  },
  emerald: {
    ring: 'ring-emerald-100',
    badge: 'bg-emerald-50 text-emerald-800',
    chip: 'border-emerald-100 bg-emerald-50/50',
    avatar: 'bg-emerald-100 text-emerald-700',
  },
}

const panelShell =
  'overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-[0_12px_40px_rgba(15,23,42,0.14)] ring-1 ring-slate-900/5'

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) {
    const w = parts[0]
    return (w.length >= 2 ? w.slice(0, 2) : w[0] || '?').toUpperCase()
  }
  return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase() || '?'
}

const AddCircleButton = forwardRef(function AddCircleButton(
  { onClick, disabled, className, size = 'md', active = false },
  ref,
) {
  const dim = size === 'sm' ? 'h-9 w-9' : 'h-11 w-11'
  const icon = size === 'sm' ? 18 : 22
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full text-white shadow-md transition',
        'hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3CB878]/45',
        'disabled:cursor-not-allowed disabled:opacity-45',
        active ? 'ring-2 ring-[#3CB878]/40 ring-offset-2' : '',
        dim,
        className,
      )}
      style={{ backgroundColor: disabled ? undefined : cubicle.greenCta }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = cubicle.greenCtaHover
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = cubicle.greenCta
      }}
      aria-label="Ekle"
      aria-expanded={active}
    >
      <Plus size={icon} strokeWidth={2.5} />
    </button>
  )
})

function PersonAvatarChip({ name, tone = 'indigo', onRemove, size = 'md' }) {
  const t = TONES[tone] || TONES.indigo
  const dim = size === 'sm' ? 'h-9 w-9 text-[10px]' : 'h-11 w-11 text-xs'
  const displayName =
    typeof name === 'string' && name.trim() && name.trim() !== '—' ? name.trim() : null
  return (
    <span className="group relative inline-flex shrink-0">
      <span
        className={cn(
          'flex items-center justify-center rounded-full font-bold ring-2 ring-white shadow-sm',
          displayName ? 'cursor-help' : 'cursor-default',
          dim,
          t.avatar,
        )}
        aria-label={displayName || 'Personel'}
        tabIndex={displayName ? 0 : undefined}
      >
        {initials(displayName)}
      </span>
      {displayName ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-30 max-w-[220px] -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {displayName}
          <span
            className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900"
            aria-hidden
          />
        </span>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -right-0.5 -top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-white opacity-0 shadow transition group-hover:opacity-100"
          aria-label={`${displayName || 'Personel'} — ekipten çıkar`}
        >
          <X size={10} strokeWidth={3} />
        </button>
      ) : null}
    </span>
  )
}

function usePickerPosition(anchorRef, open) {
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useLayoutEffect(() => {
    if (!open || !anchorRef?.current) return undefined
    const update = () => {
      const rect = anchorRef.current.getBoundingClientRect()
      const gap = 10
      let left = rect.right + gap
      let top = rect.top
      if (left + PANEL_W > window.innerWidth - 12) {
        left = rect.left - PANEL_W - gap
      }
      left = Math.max(12, Math.min(left, window.innerWidth - PANEL_W - 12))
      const maxTop = window.innerHeight - PANEL_MAX_H - 12
      top = Math.max(12, Math.min(top, maxTop))
      setPos({ top, left })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchorRef, open])

  return pos
}

function PickerPopover({ open, onClose, anchorRef, options, onPick, title, searchPlaceholder = 'Ara…' }) {
  const [q, setQ] = useState('')
  const panelRef = useRef(null)
  const pos = usePickerPosition(anchorRef, open)

  useEffect(() => {
    if (!open) {
      setQ('')
      return undefined
    }
    const onDoc = (e) => {
      const t = e.target
      if (panelRef.current?.contains(t)) return
      if (anchorRef?.current?.contains(t)) return
      onClose?.()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, anchorRef])

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr')
    if (!needle) return options
    return options.filter((o) => String(o.name || '').toLocaleLowerCase('tr').includes(needle))
  }, [options, q])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={title || 'Seçim'}
      className={panelShell}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: PANEL_W,
        zIndex: PICKER_Z,
      }}
    >
      <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
        {title ? <p className="mb-1.5 text-xs font-bold text-slate-800">{title}</p> : null}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-[#E2E8F0] bg-white py-1.5 pl-8 pr-2 text-sm text-slate-900 outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
            autoFocus
          />
        </div>
      </div>
      <ul className="max-h-56 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-slate-500">Sonuç yok</li>
        ) : (
          filtered.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-800 transition hover:bg-[#EFF6FF]"
                onClick={() => {
                  onPick?.(o.id)
                  onClose?.()
                }}
              >
                <PersonAvatarChip name={o.name} tone="emerald" size="sm" />
                <span className="min-w-0 flex-1 truncate font-medium">{o.name}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>,
    document.body,
  )
}

function AddPickerTrigger({ open, onToggle, disabled, size, options, onPick, onClose, title, searchPlaceholder }) {
  const anchorRef = useRef(null)
  return (
    <>
      <AddCircleButton
        ref={anchorRef}
        size={size}
        disabled={disabled}
        active={open}
        onClick={onToggle}
      />
      <PickerPopover
        open={open}
        onClose={onClose}
        anchorRef={anchorRef}
        options={options}
        onPick={onPick}
        title={title}
        searchPlaceholder={searchPlaceholder}
      />
    </>
  )
}

function AssignPickerRow({ label, emptyHint, children, picker }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <p className="mb-2 text-sm font-bold text-slate-800">
        {label}
        {emptyHint ? <span className="font-semibold text-slate-500">: {emptyHint}</span> : null}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {picker}
      </div>
    </div>
  )
}

/** Kart kabuğu — görev atama panelleri */
export function TaskAssignPanel({ children, className, compact = false, variant = 'default' }) {
  const elevated = variant === 'elevated'
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border bg-white',
        elevated
          ? 'border-slate-200/90 shadow-[0_1px_3px_rgba(15,23,42,0.06)]'
          : 'border-[#E2E8F0] shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        elevated ? 'p-0' : compact ? 'p-2.5' : 'p-3',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function TaskAssignSinglePersonRow({
  label = 'Sorumlu personel',
  emptyHint = 'Hiç kimse',
  value,
  options = [],
  onChange,
  tone = 'indigo',
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => String(o.id) === String(value))
  const available = options

  return (
    <AssignPickerRow
      label={label}
      emptyHint={!selected ? emptyHint : null}
      picker={
        <AddPickerTrigger
          open={open}
          onToggle={() => !disabled && setOpen((v) => !v)}
          disabled={disabled || available.length === 0}
          size="sm"
          options={available}
          onPick={(id) => onChange?.(id)}
          onClose={() => setOpen(false)}
          title="Personel seçin"
        />
      }
    >
      {selected ? (
        <PersonAvatarChip
          name={selected.name}
          tone={tone}
          onRemove={disabled ? undefined : () => onChange?.('')}
        />
      ) : null}
    </AssignPickerRow>
  )
}

export function TaskAssignPeopleChipPicker({
  title,
  countLabel,
  tone = 'indigo',
  icon: Icon = Users,
  options = [],
  /** Seçili kişilerin adını çözmek için (ör. ekipte olup havuzda olmayan üyeler) */
  selectedOptions,
  /** Doğrudan id → görünen ad (ekip listesi gibi) */
  getSelectedLabel,
  selectedIds = [],
  readOnly = false,
  onAdd,
  onRemove,
  emptyText = 'Henüz personel seçilmedi.',
  compact = false,
  headerAction = null,
}) {
  const [open, setOpen] = useState(false)
  const t = TONES[tone] || TONES.indigo
  const nameLookup = useMemo(() => {
    const list = [...(selectedOptions || []), ...options]
    const seen = new Set()
    return list.filter((o) => {
      const key = String(o.id)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [selectedOptions, options])
  const resolveName = (id) => {
    const fromFn = getSelectedLabel?.(id)
    if (fromFn && String(fromFn).trim()) return String(fromFn).trim()
    const hit = nameLookup.find((o) => String(o.id) === String(id))
    return hit?.name?.trim() || null
  }
  const available = useMemo(
    () => options.filter((o) => !selectedIds.some((id) => String(id) === String(o.id))),
    [options, selectedIds],
  )

  const hasSelection = selectedIds.length > 0

  return (
    <TaskAssignPanel compact={false} variant="elevated">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
              t.avatar,
            )}
          >
            <Icon size={15} strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-tight text-slate-900">{title}</p>
            <p className="text-[11px] text-slate-500">Proje ekibinden seçin</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerAction}
          {countLabel ? (
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums',
                t.badge,
              )}
            >
              {countLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className="p-3">
        <div
          className={cn(
            'flex min-h-[56px] flex-wrap items-center gap-2 rounded-xl px-2.5 py-2 transition-colors',
            hasSelection
              ? 'border border-slate-100 bg-slate-50/50'
              : 'border border-dashed border-slate-200 bg-slate-50/30',
          )}
        >
          {hasSelection ? (
            selectedIds.map((id) => (
              <PersonAvatarChip
                key={id}
                name={resolveName(id)}
                tone={tone}
                onRemove={readOnly ? undefined : () => onRemove?.(id)}
              />
            ))
          ) : (
            <p className="px-1 text-xs text-slate-400">{emptyText}</p>
          )}
          {!readOnly ? (
            <AddPickerTrigger
              open={open}
              onToggle={() => setOpen((v) => !v)}
              disabled={available.length === 0}
              size="sm"
              options={available}
              onPick={(id) => onAdd?.(id)}
              onClose={() => setOpen(false)}
              title="Personel ekle"
            />
          ) : null}
        </div>
      </div>
    </TaskAssignPanel>
  )
}

export function TaskAssignOrderedPeoplePicker({
  title,
  countLabel,
  tone = 'sky',
  options = [],
  selectedOptions,
  orderedIds = [],
  onAdd,
  onRemove,
  onMove,
  emptyText = 'Henüz eklenmedi.',
  compact = false,
  icon: Icon = Users,
}) {
  const [open, setOpen] = useState(false)
  const t = TONES[tone] || TONES.sky
  const nameLookup = useMemo(() => {
    const list = [...(selectedOptions || []), ...options]
    const seen = new Set()
    return list.filter((o) => {
      const key = String(o.id)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [selectedOptions, options])
  const resolveName = (id) => nameLookup.find((o) => String(o.id) === String(id))?.name || '—'
  const available = options.filter((o) => !orderedIds.some((id) => String(id) === String(o.id)))

  return (
    <TaskAssignPanel compact={compact}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', t.avatar)}>
            <Icon size={14} strokeWidth={2.25} />
          </span>
          <p className="truncate text-sm font-bold text-slate-900">{title}</p>
        </div>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-bold', t.badge)}>
          {countLabel}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {orderedIds.length === 0 ? (
          <span className="text-xs text-slate-500">{emptyText}</span>
        ) : (
          orderedIds.map((id, idx) => (
            <span key={`${id}-${idx}`} className="relative inline-flex">
              <span className="absolute -left-1 -top-1 z-[1] flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-[9px] font-bold text-white">
                {idx + 1}
              </span>
              <PersonAvatarChip name={resolveName(id)} tone={tone} onRemove={() => onRemove?.(id)} />
            </span>
          ))
        )}
        <AddPickerTrigger
          open={open}
          onToggle={() => setOpen((v) => !v)}
          disabled={available.length === 0}
          size="sm"
          options={available}
          onPick={(id) => onAdd?.(id)}
          onClose={() => setOpen(false)}
          title="Sıraya ekle"
        />
      </div>
      {orderedIds.length > 1 ? (
        <ul className={cn('mt-2 space-y-1 border-t border-[#E2E8F0] pt-2', compact && 'max-h-32 overflow-y-auto')}>
          {orderedIds.map((id, idx) => (
            <li
              key={`ord-${id}-${idx}`}
              className={cn('flex items-center gap-2 rounded-lg border px-2 py-1.5', t.chip, 'ring-1', t.ring)}
            >
              <span className="text-xs font-bold text-slate-500">{idx + 1}.</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                {resolveName(id)}
              </span>
              <div className="flex shrink-0">
                {onMove ? (
                  <>
                    <button
                      type="button"
                      title="Yukarı"
                      onClick={() => onMove(idx, -1)}
                      className="rounded-md p-1 text-slate-500 hover:bg-white/80"
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      type="button"
                      title="Aşağı"
                      onClick={() => onMove(idx, 1)}
                      className="rounded-md p-1 text-slate-500 hover:bg-white/80"
                    >
                      <ChevronDown size={15} />
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </TaskAssignPanel>
  )
}

export function TaskAssignUnitChipPicker({
  title = 'Birimler',
  options = [],
  selectedIds = [],
  onAdd,
  onRemove,
  emptyText = 'Henüz birim seçilmedi.',
  compact = false,
}) {
  const [open, setOpen] = useState(false)
  const resolveName = (id) => options.find((o) => String(o.id) === String(id))?.name || '—'
  const available = options.filter((o) => !selectedIds.some((id) => String(id) === String(o.id)))

  return (
    <TaskAssignPanel compact={compact}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-[#2563EB]">
            <Building2 size={14} strokeWidth={2.25} />
          </span>
          <p className="text-sm font-bold text-slate-900">{title}</p>
        </div>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-[#1D4ED8]">
          {selectedIds.length} birim
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {selectedIds.length === 0 ? (
          <span className="text-xs text-slate-500">{emptyText}</span>
        ) : (
          selectedIds.map((id) => (
            <span
              key={id}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-blue-100 bg-blue-50/80 py-1 pl-2.5 pr-1 text-xs font-semibold text-slate-800"
            >
              <span className="max-w-[140px] truncate">{resolveName(id)}</span>
              <button
                type="button"
                onClick={() => onRemove?.(id)}
                className="rounded-full p-0.5 text-slate-400 hover:bg-white hover:text-red-600"
                aria-label="Kaldır"
              >
                <X size={12} />
              </button>
            </span>
          ))
        )}
        <AddPickerTrigger
          open={open}
          onToggle={() => setOpen((v) => !v)}
          disabled={available.length === 0}
          size="sm"
          options={available}
          onPick={(id) => onAdd?.(id)}
          onClose={() => setOpen(false)}
          title="Birim ekle"
          searchPlaceholder="Birim ara…"
        />
      </div>
    </TaskAssignPanel>
  )
}

export function TaskAssignUnitSelect({
  label = 'Birim',
  value,
  options = [],
  onChange,
  mixedValue,
  mixedLabel = 'Karma birimler (şirket geneli)',
  mixedHint,
  disabled = false,
  compact = false,
}) {
  const selected = options.find((o) => String(o.id) === String(value))
  const isMixed = mixedValue && String(value) === String(mixedValue)

  return (
    <div className={cn('task-assign-unit-field', compact && 'task-assign-unit-field--compact')}>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
        <Building2 size={14} className="text-[#2563EB]" strokeWidth={2.25} />
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          className={cn(
            'w-full appearance-none rounded-xl border border-[#E2E8F0] bg-white py-2.5 pl-3 pr-9 text-sm font-medium text-slate-900 shadow-sm',
            'outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15',
            'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60',
            selected || isMixed ? 'border-blue-200' : '',
          )}
        >
          <option value="">Birim seçin…</option>
          {mixedValue ? <option value={mixedValue}>{mixedLabel}</option> : null}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
      </div>
      {isMixed && mixedHint ? (
        <p className="mt-1.5 text-xs leading-snug text-slate-500">{mixedHint}</p>
      ) : null}
      {selected ? (
        <p className="mt-1.5 text-xs font-medium text-[#1D4ED8]">
          Seçili: <span className="font-bold text-slate-800">{selected.name}</span>
        </p>
      ) : null}
    </div>
  )
}

export function TaskAssignRolePairPicker({
  stepIndex,
  yapanValue,
  yapanOptions = [],
  onYapanChange,
  denetimciValue,
  denetimciOptions = [],
  onDenetimciChange,
  onMoveUp,
  onMoveDown,
  onRemove,
  canRemove,
  compact = false,
}) {
  return (
    <TaskAssignPanel
      compact={compact}
      className="border-fuchsia-100/80 bg-gradient-to-br from-fuchsia-50/30 via-white to-blue-50/20"
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="rounded-md bg-fuchsia-600 px-2 py-0.5 text-xs font-bold text-white shadow-sm">
          {stepIndex}. adım
        </span>
        <div className="flex gap-0.5">
          <button type="button" onClick={onMoveUp} className="rounded-md p-1 text-slate-500 hover:bg-white/90">
            <ChevronUp size={15} />
          </button>
          <button type="button" onClick={onMoveDown} className="rounded-md p-1 text-slate-500 hover:bg-white/90">
            <ChevronDown size={15} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={!canRemove}
            className="rounded-md p-1 text-red-500 hover:bg-red-50 disabled:opacity-30"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <TaskAssignSinglePersonRow
          label="Sorumlu"
          emptyHint="Seçilmedi"
          value={yapanValue}
          options={yapanOptions}
          onChange={onYapanChange}
          tone="sky"
        />
        <TaskAssignSinglePersonRow
          label="Denetimci"
          emptyHint="Seçilmedi"
          value={denetimciValue}
          options={denetimciOptions}
          onChange={onDenetimciChange}
          tone="indigo"
        />
      </div>
    </TaskAssignPanel>
  )
}
