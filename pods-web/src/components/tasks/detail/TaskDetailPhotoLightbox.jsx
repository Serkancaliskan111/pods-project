import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import { coercePhotoUrl } from '../../../pages/admin/tasks/taskShow/taskShowUtils.js'

/** Her + veya − basışında tek kademe */
const ZOOM_STEPS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3]

function findPhotoIndex(list, url) {
  const target = coercePhotoUrl(url)
  if (!target) return 0
  const i = list.findIndex((u) => u === target)
  return i >= 0 ? i : 0
}

export default function TaskDetailPhotoLightbox({ photos = [], currentUrl, onClose }) {
  const list = useMemo(() => {
    const base = photos.map((p) => coercePhotoUrl(p)).filter(Boolean)
    const cur = coercePhotoUrl(currentUrl)
    if (cur && !base.includes(cur)) return [...base, cur]
    return base
  }, [photos, currentUrl])

  const [index, setIndex] = useState(() => findPhotoIndex(list, currentUrl))
  const [zoomIdx, setZoomIdx] = useState(0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef({ active: false, startX: 0, startY: 0, panX: 0, panY: 0 })

  const scale = ZOOM_STEPS[zoomIdx] ?? 1
  const url = list[index]
  const hasMany = list.length > 1

  const resetTransform = useCallback(() => {
    setZoomIdx(0)
    setPan({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    const i = findPhotoIndex(list, currentUrl)
    setIndex(i)
    resetTransform()
  }, [currentUrl, list, resetTransform])

  const goPrev = useCallback(
    (e) => {
      e?.preventDefault?.()
      e?.stopPropagation?.()
      if (!hasMany) return
      setIndex((i) => (i <= 0 ? list.length - 1 : i - 1))
    },
    [hasMany, list.length],
  )

  const goNext = useCallback(
    (e) => {
      e?.preventDefault?.()
      e?.stopPropagation?.()
      if (!hasMany) return
      setIndex((i) => (i >= list.length - 1 ? 0 : i + 1))
    },
    [hasMany, list.length],
  )

  const zoomIn = useCallback((e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    setZoomIdx((z) => Math.min(z + 1, ZOOM_STEPS.length - 1))
  }, [])

  const zoomOut = useCallback((e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    setZoomIdx((z) => Math.max(z - 1, 0))
  }, [])

  useEffect(() => {
    resetTransform()
  }, [index, resetTransform])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
        return
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        zoomIn()
        return
      }
      if (e.key === '-') {
        e.preventDefault()
        zoomOut()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, goPrev, goNext, zoomIn, zoomOut])

  const onPointerDown = (e) => {
    if (scale <= 1) return
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e) => {
    if (!dragRef.current.active) return
    setPan({
      x: dragRef.current.panX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.panY + (e.clientY - dragRef.current.startY),
    })
  }

  const onPointerUp = (e) => {
    dragRef.current.active = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  if (!url) return null

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Fotoğraf önizleme"
      className="fixed inset-0 z-[10050] flex flex-col bg-slate-950/92 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-2 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-sm font-semibold tabular-nums">
          {hasMany ? (
            <span>
              {index + 1} / {list.length}
            </span>
          ) : (
            <span>Fotoğraf</span>
          )}
          <span className="text-white/50">·</span>
          <span className="text-white/70">%{Math.round(scale * 100)}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoomIdx <= 0}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40"
            title="Uzaklaştır (−)"
          >
            <ZoomOut size={20} />
          </button>
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoomIdx >= ZOOM_STEPS.length - 1}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40"
            title="Yakınlaştır (+)"
          >
            <ZoomIn size={20} />
          </button>
          {scale > 1 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                resetTransform()
              }}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20"
              title="Sıfırla"
            >
              <RotateCcw size={18} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClose?.()
            }}
            className="ml-1 flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20"
            title="Kapat"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-16 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        {hasMany ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-4 top-1/2 z-30 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white shadow-lg ring-1 ring-white/25 transition hover:bg-white/30 sm:left-8"
              aria-label="Önceki fotoğraf"
            >
              <ChevronLeft size={28} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-4 top-1/2 z-30 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white shadow-lg ring-1 ring-white/25 transition hover:bg-white/30 sm:right-8"
              aria-label="Sonraki fotoğraf"
            >
              <ChevronRight size={28} strokeWidth={2.5} />
            </button>
          </>
        ) : null}

        <div
          className={cn(
            'touch-none select-none',
            scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={(e) => {
            e.stopPropagation()
            resetTransform()
          }}
        >
          <img
            src={url}
            alt=""
            draggable={false}
            className="max-h-[calc(100vh-8rem)] max-w-[min(88vw,1100px)] rounded-lg object-contain shadow-2xl transition-transform duration-150"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: 'center center',
            }}
          />
        </div>
      </div>

      {hasMany && list.length <= 12 ? (
        <div
          className="flex shrink-0 justify-center gap-2 overflow-x-auto px-4 pb-4"
          onClick={(e) => e.stopPropagation()}
        >
          {list.map((thumb, i) => (
            <button
              key={`${thumb}-${i}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIndex(i)
              }}
              className={cn(
                'h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-2 transition',
                i === index ? 'ring-white' : 'ring-transparent opacity-60 hover:opacity-100',
              )}
            >
              <img src={thumb} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay
}
