import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, ChevronRight, Clock, Search, Sparkles, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  getFeaturedHelpGuides,
  groupGuidesByCategory,
  guideMatchesSearch,
} from '../../lib/helpGuides.js'
import { useHelpGuide } from '../../contexts/HelpGuideContext.jsx'
import { useHelpGuidePopoverZ } from '../../hooks/useHelpGuidePopoverZ.js'

const PANEL_Z = 10070

function GuideRow({ guide, activeGuideId, onPick }) {
  const steps = guide.steps?.length || 0
  const mins = guide.estimatedMinutes || 1
  const handsOn = (guide.steps || []).some((s) => s.doThis)
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(guide.id)}
        className={cn(
          'flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition',
          activeGuideId === guide.id ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50',
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-900">{guide.title}</span>
          <span className="mt-0.5 block text-xs leading-snug text-slate-500">
            {guide.summary || guide.description}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-400">
            <span>{steps} adım</span>
            {handsOn ? (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-emerald-800">
                Uygulamalı
              </span>
            ) : null}
            <span className="inline-flex items-center gap-0.5">
              <Clock size={10} />~{mins} dk
            </span>
          </span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-slate-400" />
      </button>
    </li>
  )
}

export default function HelpGuideLauncher({ compact = false, iconOnly = false }) {
  const { visibleGuides, startGuide, isActive, stopGuide, activeGuideId } = useHelpGuide()
  const panelZ = useHelpGuidePopoverZ(PANEL_Z)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const [anchor, setAnchor] = useState({ top: 0, left: 0, width: 400 })

  const { featured, rest } = useMemo(
    () => getFeaturedHelpGuides(visibleGuides),
    [visibleGuides],
  )

  const searchFiltered = useMemo(() => {
    const term = search.trim()
    if (!term) return null
    return visibleGuides.filter((g) => guideMatchesSearch(g, term))
  }, [visibleGuides, search])

  const grouped = useMemo(() => {
    const base = searchFiltered ?? rest
    return groupGuidesByCategory(base)
  }, [searchFiltered, rest])

  const updateAnchor = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 12
    const width = Math.min(420, window.innerWidth - margin * 2)
    const maxPanelH = Math.min(window.innerHeight * 0.72, 560)
    let left = rect.left
    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - width - margin)
    }
    let top = rect.bottom + 8
    if (top + maxPanelH > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - maxPanelH - 8)
    }
    setAnchor({ top, left, width })
  }, [])

  useEffect(() => {
    if (!open) return undefined
    updateAnchor()
    const onScroll = () => updateAnchor()
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, updateAnchor])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointer = (e) => {
      const t = e.target
      if (triggerRef.current?.contains(t)) return
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

  const pickGuide = (id) => {
    setOpen(false)
    setSearch('')
    if (isActive && activeGuideId === id) {
      stopGuide()
      return
    }
    startGuide(id)
  }

  const showFeatured = !search.trim() && featured.length > 0

  const panel =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            id="help-guide-topic-panel"
            role="dialog"
            aria-label="Kılavuz konuları"
            className="fixed max-h-[min(72vh,560px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.2)]"
            style={{
              zIndex: panelZ,
              top: anchor.top,
              left: anchor.left,
              width: anchor.width,
            }}
          >
            <div className="border-b border-slate-100 bg-gradient-to-b from-blue-50/90 to-white px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">Kılavuz ve yardım</h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                    Konu seçin; vurgulanan alan parlayarak gösterilir. Tıklamanız
                    gereken yere doğrudan tıklayın.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                  aria-label="Kapat"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="relative mt-3">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Konu, anahtar kelime veya adım metni…"
                  className="w-full rounded-full border-0 bg-white py-2 pl-9 pr-3 text-sm shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>
            <div className="max-h-[min(54vh,460px)] overflow-y-auto overscroll-contain p-2">
              {searchFiltered && searchFiltered.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  Aramanızla eşleşen konu bulunamadı.
                </p>
              ) : (
                <>
                  {showFeatured ? (
                    <div className="mb-3 px-1">
                      <p className="mb-1 flex items-center gap-1 px-2 text-[10px] font-bold uppercase tracking-wider text-blue-600">
                        <Sparkles size={11} />
                        Önerilen
                      </p>
                      <ul className="space-y-0.5">
                        {featured.map((g) => (
                          <GuideRow
                            key={g.id}
                            guide={g}
                            activeGuideId={activeGuideId}
                            onPick={pickGuide}
                          />
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {grouped.length ? (
                    grouped.map((row) => (
                      <div key={row.category} className="mb-3 last:mb-0">
                        <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {row.category}
                        </p>
                        <ul className="space-y-0.5">
                          {row.guides.map((g) => (
                            <GuideRow
                              key={g.id}
                              guide={g}
                              activeGuideId={activeGuideId}
                              onPick={pickGuide}
                            />
                          ))}
                        </ul>
                      </div>
                    ))
                  ) : (
                    <p className="px-4 py-8 text-center text-sm text-slate-500">
                      Erişebileceğiniz kılavuz konusu yok.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-help="help-launcher"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative inline-flex items-center transition',
          iconOnly
            ? 'justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            : cn(
                'rounded-full border shadow-sm',
                compact
                  ? 'gap-1 px-2.5 py-1.5 text-xs font-semibold'
                  : 'gap-2 px-4 py-2.5 text-sm font-semibold',
                open || isActive
                  ? 'border-blue-300 bg-blue-50 text-blue-800'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              ),
          iconOnly &&
            (open || isActive
              ? 'bg-blue-50 text-blue-700'
              : ''),
        )}
        aria-label="Kılavuz"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? 'help-guide-topic-panel' : undefined}
      >
        <BookOpen size={iconOnly ? 16 : compact ? 14 : 16} strokeWidth={1.75} />
        {!iconOnly ? 'Kılavuz' : null}
        {isActive ? (
          <span
            className={cn(
              'absolute rounded-full bg-blue-500 ring-2 ring-white',
              iconOnly || compact ? '-right-0.5 -top-0.5 h-2 w-2' : '-right-0.5 -top-0.5 h-2.5 w-2.5',
            )}
          />
        ) : null}
      </button>
      {panel}
    </>
  )
}
