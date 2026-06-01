import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'
import Text from './Text'

export default function Modal({ open, onClose, title, children, size = 'md', className }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    if (open) {
      document.addEventListener('keydown', onKey)
      const previous = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.removeEventListener('keydown', onKey)
        document.body.style.overflow = previous
      }
    }
    return () => {}
  }, [open, onClose])

  if (!open) return null

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-3xl',
  }

  const content = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-primary-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 flex w-full flex-col rounded-3xl bg-white shadow-xl border border-slate-100',
          sizes[size] || sizes.md,
          !title ? 'p-6' : '',
          className,
        )}
        style={{ boxShadow: '0 25px 50px -12px rgba(5, 27, 63, 0.22)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
            <Text variant="h2" className="!text-lg !font-extrabold tracking-tight">
              {title}
            </Text>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 text-xl leading-none"
              aria-label="Kapat"
            >
              ×
            </button>
          </div>
        ) : null}
        <div className={cn('min-h-0', title ? 'flex flex-1 flex-col overflow-hidden' : '')}>
          {children}
        </div>
      </div>
    </div>
  )

  return typeof window !== 'undefined' ? createPortal(content, document.body) : null
}
