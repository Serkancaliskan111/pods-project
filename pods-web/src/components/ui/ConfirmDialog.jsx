import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Tarayıcı confirm/prompt yerine panel içi onay.
 * @param {'default'|'danger'|'primary'|'warning'} variant — onay butonu rengi
 */
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
  const confirmDisabled =
    loading ||
    (reasonInput && reasonRequired && !trimmedReason)

  const palette =
    variant === 'danger'
      ? { bg: '#dc2626' }
      : variant === 'primary'
        ? { bg: '#16a34a' }
        : variant === 'warning'
          ? { bg: '#ea580c' }
          : { bg: '#0a1e42' }

  const handleConfirm = () => {
    if (confirmDisabled) return
    if (reasonInput) {
      onConfirm?.(trimmedReason || undefined)
    } else {
      onConfirm?.()
    }
  }

  const msgNode =
    typeof message === 'string' ? (
      <p style={{ margin: 0, fontSize: 14, color: '#475569', lineHeight: 1.55 }}>{message}</p>
    ) : (
      message
    )

  const content = (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center p-4"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={() => !loading && onClose?.()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative z-10 w-full max-w-[440px] rounded-2xl bg-white p-6 shadow-2xl border border-slate-200/90"
        style={{ boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.22)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-dialog-title"
          className="text-[17px] font-bold text-slate-900 tracking-tight mb-3 pr-8"
        >
          {title}
        </h2>
        <button
          type="button"
          disabled={loading}
          onClick={() => onClose?.()}
          className="absolute top-4 right-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 text-xl leading-none font-light"
          aria-label="Kapat"
        >
          ×
        </button>
        <div className="mb-5">{msgNode}</div>
        {reasonInput ? (
          <label className="block mb-5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2 block">
              {reasonLabel}
              {reasonRequired ? <span className="text-red-600 font-bold"> *</span> : null}
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              rows={reasonRequired ? 4 : 3}
              disabled={loading}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0a1e42]/15 focus:border-[#0a1e42]/40 resize-y min-h-[88px]"
            />
          </label>
        ) : null}
        <div className="flex justify-end gap-3 flex-wrap pt-1">
          <button
            type="button"
            disabled={loading}
            onClick={() => onClose?.()}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-45"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={handleConfirm}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-45 disabled:cursor-not-allowed border border-transparent"
            style={{
              backgroundColor: palette.bg,
              boxShadow: `0 10px 22px -12px ${palette.bg}aa`,
            }}
          >
            {loading ? 'İşleniyor…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null
}
