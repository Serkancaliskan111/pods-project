import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { cn } from '../lib/cn'

const TOOLTIP_Z = 10050

/**
 * Alan açıklaması — üzerine gelince veya tıklayınca kısa bilgi gösterir.
 * Modal / overflow:hidden içinde kesilmemesi için portal + fixed konum kullanır.
 */
export default function FieldInfoTip({ text, className, stopPropagation = false }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const id = useId()
  const btnRef = useRef(null)

  const updatePosition = () => {
    const el = btnRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const maxW = Math.min(280, window.innerWidth - 24)
    let left = rect.left + rect.width / 2 - maxW / 2
    left = Math.max(12, Math.min(left, window.innerWidth - maxW - 12))
    const spaceAbove = rect.top
    const spaceBelow = window.innerHeight - rect.bottom
    const showBelow = spaceAbove < 100 && spaceBelow > spaceAbove
    const top = showBelow ? rect.bottom + 8 : rect.top - 8
    setCoords({ left, top, maxW, showBelow })
  }

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return undefined
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (btnRef.current && !btnRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!text) return null

  const tooltip =
    open && coords && typeof document !== 'undefined'
      ? createPortal(
          <span
            id={id}
            role="tooltip"
            style={{
              position: 'fixed',
              left: coords.left,
              top: coords.top,
              width: coords.maxW,
              zIndex: TOOLTIP_Z,
              transform: coords.showBelow ? 'none' : 'translateY(-100%)',
            }}
            className="pointer-events-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-xs font-normal leading-snug text-slate-600 shadow-lg ring-1 ring-slate-900/5"
          >
            {text}
          </span>,
          document.body,
        )
      : null

  return (
    <>
      <span ref={btnRef} className={cn('relative inline-flex shrink-0 align-middle', className)}>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30"
          aria-label="Bilgi"
          aria-expanded={open}
          aria-describedby={open ? id : undefined}
          onClick={(e) => {
            if (stopPropagation) e.stopPropagation()
            setOpen((v) => !v)
          }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        >
          <Info size={14} strokeWidth={2.25} aria-hidden />
        </button>
      </span>
      {tooltip}
    </>
  )
}
