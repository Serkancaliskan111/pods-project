import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'
import Button from './Button'
import { Textarea } from './Input'
import Text from './Text'

const VARIANT_MAP = {
  default: 'primary',
  primary: 'success',
  danger: 'danger',
  warning: 'accent',
}

export default function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel = 'Onayla',
  cancelLabel = 'İptal',
  variant = 'default',
  loading = false,
  reasonInput = false,
  reasonRequired = false,
  reasonLabel = 'Açıklama',
  reasonPlaceholder = '',
  onConfirm,
}) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !loading) onClose?.()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, loading, onClose])

  if (!open) return null

  const trimmedReason = String(reason || '').trim()
  const confirmDisabled = loading || (reasonInput && reasonRequired && !trimmedReason)
  const btnVariant = VARIANT_MAP[variant] || 'primary'

  const handleConfirm = () => {
    if (confirmDisabled) return
    if (reasonInput) onConfirm?.(trimmedReason || undefined)
    else onConfirm?.()
  }

  const content = (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4" role="presentation">
      <div
        className="absolute inset-0 bg-primary-900/45 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={() => !loading && onClose?.()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative z-10 w-full max-w-[440px] rounded-3xl bg-white p-6 border border-slate-100"
        style={{ boxShadow: '0 25px 50px -12px rgba(5, 27, 63, 0.22)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <Text variant="h2" id="confirm-dialog-title" className="pr-8 mb-3">
          {title}
        </Text>
        <button
          type="button"
          disabled={loading}
          onClick={() => onClose?.()}
          className="absolute top-4 right-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-50 text-xl leading-none"
          aria-label="Kapat"
        >
          ×
        </button>
        <div className="mb-5">
          {typeof message === 'string' ? (
            <Text variant="body" className="text-slate-500">
              {message}
            </Text>
          ) : (
            message
          )}
        </div>
        {reasonInput ? (
          <Textarea
            label={reasonLabel + (reasonRequired ? ' *' : '')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={reasonPlaceholder}
            rows={reasonRequired ? 4 : 3}
            disabled={loading}
            className="mb-5"
          />
        ) : null}
        <div className="flex justify-end gap-3 flex-wrap">
          <Button variant="secondary" disabled={loading} onClick={() => onClose?.()}>
            {cancelLabel}
          </Button>
          <Button variant={btnVariant} disabled={confirmDisabled} onClick={handleConfirm}>
            {loading ? 'İşleniyor…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null
}
