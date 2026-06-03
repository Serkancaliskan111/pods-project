import { useCallback, useMemo, useState } from 'react'
import { Search, UserCheck, Users, X } from 'lucide-react'
import { cubicle } from '../../theme/cubicle.js'
import { cn } from '../../lib/cn'
import Sheet from '../../ui/Sheet.jsx'

const TONE_BADGE = {
  emerald: 'bg-emerald-50 text-emerald-800',
  indigo: 'bg-indigo-50 text-indigo-800',
  sky: 'bg-sky-50 text-sky-800',
}

/**
 * Çok sayıda proje ekibi üyesi — kompakt özet + arama/checkbox sheet.
 */
export default function ProjectTeamBulkPicker({
  title = 'Proje ekibi',
  subtitle = 'Görev atamasında yalnızca ekip üyeleri seçilebilir.',
  selectedIds = [],
  onChange,
  options = [],
  readOnly = false,
  tone = 'emerald',
  emptyText = 'Henüz kimse eklenmedi.',
}) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [query, setQuery] = useState('')

  const idSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds])
  const optionMap = useMemo(() => {
    const m = new Map()
    for (const o of options) m.set(String(o.id), o)
    return m
  }, [options])

  const resolveName = useCallback(
    (id) => optionMap.get(String(id))?.name?.trim() || 'Personel',
    [optionMap],
  )

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr')
    if (!needle) return options
    return options.filter((o) =>
      String(o.name || '')
        .toLocaleLowerCase('tr')
        .includes(needle),
    )
  }, [options, query])

  const toggleId = (id) => {
    const key = String(id)
    if (idSet.has(key)) {
      onChange?.(selectedIds.filter((x) => String(x) !== key))
    } else {
      onChange?.([...selectedIds, id])
    }
  }

  const selectAllFiltered = () => {
    const next = new Set(selectedIds.map(String))
    for (const o of filteredOptions) next.add(String(o.id))
    onChange?.([...next])
  }

  const clearAll = () => onChange?.([])

  const badgeCls = TONE_BADGE[tone] || TONE_BADGE.emerald

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <UserCheck size={15} strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">{title}</p>
              <p className="truncate text-[11px] text-slate-500">{subtitle}</p>
            </div>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums',
              badgeCls,
            )}
          >
            {selectedIds.length} kişi
          </span>
        </div>

        <div className="p-3">
          {!readOnly ? (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-95"
                style={{ backgroundColor: cubicle.greenCta }}
              >
                <Users size={14} strokeWidth={2.2} />
                Ekip seç
              </button>
              {selectedIds.length > 0 ? (
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Tümünü temizle
                </button>
              ) : null}
            </div>
          ) : null}

          {selectedIds.length === 0 ? (
            <p className="text-xs text-slate-400">{emptyText}</p>
          ) : (
            <ul className="max-h-36 space-y-1 overflow-y-auto overscroll-contain rounded-lg border border-slate-100 bg-slate-50/60 p-1.5">
              {selectedIds.map((id) => (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-xs shadow-sm ring-1 ring-slate-100"
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                    {resolveName(id)}
                  </span>
                  {!readOnly ? (
                    <button
                      type="button"
                      onClick={() => toggleId(id)}
                      className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`${resolveName(id)} — çıkar`}
                    >
                      <X size={14} strokeWidth={2.5} />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false)
          setQuery('')
        }}
        side="right"
        title={`${title} — personel seç`}
        className="!flex !min-h-0 !flex-1 !flex-col !overflow-hidden !p-0"
        panelClassName="!flex !max-w-[min(480px,100vw)] !flex-col !overflow-hidden"
      >
        <div className="flex shrink-0 flex-col gap-2 border-b border-slate-100 px-4 pb-3 pt-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ad, soyad veya e-posta ara…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
              autoFocus
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-slate-600">
              {selectedIds.length} / {options.length} seçili
            </span>
            <button
              type="button"
              onClick={selectAllFiltered}
              disabled={filteredOptions.length === 0}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Listeyi seç ({filteredOptions.length})
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={selectedIds.length === 0}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Temizle
            </button>
          </div>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          {filteredOptions.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-slate-500">Sonuç yok</li>
          ) : (
            filteredOptions.map((o) => {
              const checked = idSet.has(String(o.id))
              return (
                <li key={o.id}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition',
                      checked ? 'bg-emerald-50/80 ring-1 ring-emerald-100' : 'hover:bg-slate-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleId(o.id)}
                      className="h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                      {o.name}
                    </span>
                  </label>
                </li>
              )
            })
          )}
        </ul>

        <div className="shrink-0 border-t border-slate-100 bg-slate-50/90 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              setSheetOpen(false)
              setQuery('')
            }}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-white shadow-sm"
            style={{ backgroundColor: cubicle.greenCta }}
          >
            Tamam ({selectedIds.length} kişi)
          </button>
        </div>
      </Sheet>
    </>
  )
}
