import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'

/**
 * Mobil Sheet — alt panel veya sağ drawer (web).
 */
export default function Sheet({
  open,
  onClose,
  children,
  side = 'bottom',
  title,
  className,
  panelClassName,
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const isRight = side === 'right'

  const panel = (
    <div
      role="dialog"
      aria-modal="true"
      className={cn(
        'relative z-[10001] flex flex-col bg-white shadow-2xl',
        isRight
          ? 'fixed right-0 top-0 h-full w-full max-w-[min(720px,100vw)] rounded-l-3xl border-l border-slate-100'
          : 'fixed inset-x-0 bottom-0 max-h-[92vh] rounded-t-3xl border-t border-slate-100',
        panelClassName,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {!isRight ? (
        <div className="flex justify-center pt-3 pb-1">
          <span className="h-1 w-11 rounded-full bg-slate-200" aria-hidden />
        </div>
      ) : null}
      {title ? (
        <div className="shrink-0 border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
        </div>
      ) : null}
      <div className={cn('flex-1 overflow-y-auto overscroll-contain', className)}>{children}</div>
    </div>
  )

  const overlay = (
    <div className="fixed inset-0 z-[10000]">
      <div
        className="absolute inset-0 bg-primary-900/50 backdrop-blur-[2px]"
        aria-hidden
        onClick={onClose}
      />
      {panel}
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : null
}
