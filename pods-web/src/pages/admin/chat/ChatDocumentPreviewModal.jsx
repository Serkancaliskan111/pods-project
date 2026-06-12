import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  fetchTextAttachmentContent,
  getAttachmentPreviewKind,
  shareChatAttachmentFile,
} from './chatAttachmentPreviewUtils'

export default function ChatDocumentPreviewModal({
  open,
  onClose,
  url,
  fileName,
  mime,
  storagePath = null,
}) {
  const kind = useMemo(
    () => getAttachmentPreviewKind({ mime, fileName }),
    [mime, fileName],
  )
  const [text, setText] = useState('')
  const [status, setStatus] = useState('idle')
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState(false)

  const runShare = async () => {
    setSharing(true)
    setShareError(false)
    try {
      await shareChatAttachmentFile(url, fileName, mime, storagePath)
    } catch {
      setShareError(true)
    } finally {
      setSharing(false)
    }
  }

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open || !url) return undefined
    if (kind !== 'text') {
      setStatus('ready')
      setText('')
      return undefined
    }
    let alive = true
    setStatus('loading')
    setText('')
    void fetchTextAttachmentContent(url)
      .then((body) => {
        if (!alive) return
        setText(body)
        setStatus('ready')
      })
      .catch((e) => {
        if (!alive) return
        setStatus(e?.code === 'too_large' ? 'too_large' : 'error')
      })
    return () => {
      alive = false
    }
  }, [open, url, kind])

  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open || !url) return null

  const title = fileName || 'Dosya'

  const modal = (
    <div
      className="chat-doc-preview"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-doc-preview-title"
      onClick={onClose}
    >
      <div
        className="chat-doc-preview__panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="chat-doc-preview__header">
          <h2 id="chat-doc-preview-title" className="chat-doc-preview__title">
            {title}
          </h2>
          <div className="chat-doc-preview__actions">
            <button
              type="button"
              className="chat-doc-preview__btn"
              disabled={sharing}
              onClick={() => void runShare()}
            >
              {sharing ? 'Hazırlanıyor…' : 'Paylaş'}
            </button>
            <button
              type="button"
              className="chat-doc-preview__btn chat-doc-preview__btn--close"
              aria-label="Kapat"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </header>

        {shareError ? (
          <p className="chat-doc-preview__hint chat-doc-preview__hint--err" style={{ margin: '0 18px 8px' }}>
            Paylaşım başarısız. Bağlantınızı kontrol edip tekrar deneyin.
          </p>
        ) : null}

        <div className="chat-doc-preview__body">
          {kind === 'text' && status === 'loading' ? (
            <p className="chat-doc-preview__hint">Metin yükleniyor…</p>
          ) : null}
          {kind === 'text' && status === 'error' ? (
            <p className="chat-doc-preview__hint chat-doc-preview__hint--err">
              Dosya okunamadı. Paylaş butonunu deneyin.
            </p>
          ) : null}
          {kind === 'text' && status === 'too_large' ? (
            <p className="chat-doc-preview__hint">
              Dosya önizleme için çok büyük (512 KB üzeri). Paylaş ile gönderebilirsiniz.
            </p>
          ) : null}
          {kind === 'text' && status === 'ready' ? (
            <pre className="chat-doc-preview__text">{text || '(Boş dosya)'}</pre>
          ) : null}
          {kind === 'pdf' ? (
            <p className="chat-doc-preview__hint">
              PDF burada açılmaz. Paylaş ile indirebilir veya başka bir uygulamaya gönderebilirsiniz.
            </p>
          ) : null}
          {kind === 'download' ? (
            <div className="chat-doc-preview__download-only">
              <p className="chat-doc-preview__hint">
                Bu dosya türü tarayıcıda önizlenemez. Paylaş ile gönderebilirsiniz.
              </p>
              <button
                type="button"
                className="chat-doc-preview__primary"
                disabled={sharing}
                onClick={() => void runShare()}
              >
                {sharing ? 'Hazırlanıyor…' : 'Paylaş'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
