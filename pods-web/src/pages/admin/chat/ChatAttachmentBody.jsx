import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useChatShellOptional } from './ChatShellContext.jsx'
import {
  getCachedAttachmentUrl,
  prefetchAttachmentUrl,
} from './chatAttachmentCache.js'
import ChatDocumentPreviewModal from './ChatDocumentPreviewModal'
import {
  fileTypeIcon,
  getAttachmentPreviewKind,
} from './chatAttachmentPreviewUtils'
import './chat.css'

function ChatMediaLightbox({ open, onClose, url, kind }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open || !url) return null

  const lightbox = (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12000,
        backgroundColor: 'rgba(0,0,0,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        cursor: 'zoom-out',
      }}
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <button
        type="button"
        aria-label="Kapat"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 12001,
          width: 44,
          height: 44,
          borderRadius: 12,
          border: 'none',
          backgroundColor: 'rgba(255,255,255,0.15)',
          color: '#fff',
          fontSize: 22,
          fontWeight: 800,
          cursor: 'pointer',
        }}
      >
        ×
      </button>
      {kind === 'image' ? (
        <img
          src={url}
          alt=""
          style={{
            maxWidth: 'min(96vw, 1200px)',
            maxHeight: '88vh',
            objectFit: 'contain',
            borderRadius: 8,
            cursor: 'default',
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <video
          src={url}
          controls
          playsInline
          autoPlay
          style={{
            maxWidth: 'min(96vw, 1200px)',
            maxHeight: '88vh',
            borderRadius: 8,
            cursor: 'default',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <track kind="captions" />
        </video>
      )}
    </div>
  )

  return createPortal(lightbox, document.body)
}

export default function ChatAttachmentBody({ row, mine }) {
  const compact = useChatShellOptional()?.density === 'compact'
  const yol = row?.ek_yol
  const [url, setUrl] = useState(() => getCachedAttachmentUrl(yol))
  const [loading, setLoading] = useState(() => !!yol && !getCachedAttachmentUrl(yol))
  const [err, setErr] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerKind, setViewerKind] = useState('image')
  const [docOpen, setDocOpen] = useState(false)

  const fileName = row?.ek_orijinal_ad || 'Dosya'
  const mime = row?.ek_mime
  const previewKind = useMemo(
    () => getAttachmentPreviewKind({ mime, fileName }),
    [mime, fileName],
  )
  const icon = fileTypeIcon(fileName, previewKind)

  useEffect(() => {
    if (!yol) return undefined
    const cached = getCachedAttachmentUrl(yol)
    if (cached) {
      setUrl(cached)
      setLoading(false)
      setErr(false)
      return undefined
    }
    let alive = true
    setLoading(true)
    setErr(false)
    void prefetchAttachmentUrl(yol, 3600)
      .then((u) => {
        if (!alive) return
        if (u) {
          setUrl(u)
          setLoading(false)
        } else {
          setErr(true)
          setLoading(false)
        }
      })
      .catch(() => {
        if (alive) {
          setErr(true)
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
  }, [yol])

  useEffect(() => {
    if (!viewerOpen && !docOpen) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [viewerOpen, docOpen])

  const tip = row?.mesaj_tipi || 'file'

  const openViewer = (kind) => {
    setViewerKind(kind)
    setViewerOpen(true)
  }

  if (!yol) return null

  if (err) {
    return (
      <div style={{ fontSize: 13, opacity: 0.9 }}>
        Ek yüklenemedi
        {row?.ek_orijinal_ad ? ` (${row.ek_orijinal_ad})` : ''}
      </div>
    )
  }

  if (loading || !url) {
    return <div className="chat-wa-attach-skeleton" aria-label="Medya yükleniyor" />
  }

  if (tip === 'image' && url) {
    return (
      <>
        <button
          type="button"
          className={`chat-wa-media-thumb chat-wa-media-thumb--image${compact ? ' chat-wa-media-thumb--compact' : ''}`}
          onClick={() => openViewer('image')}
          title="Büyütmek için tıklayın"
        >
          <img src={url} alt="" />
        </button>
        <ChatMediaLightbox
          open={viewerOpen && viewerKind === 'image'}
          onClose={() => setViewerOpen(false)}
          url={url}
          kind="image"
        />
      </>
    )
  }

  if (tip === 'video' && url) {
    return (
      <>
        <button
          type="button"
          className={`chat-wa-media-thumb chat-wa-media-thumb--video${compact ? ' chat-wa-media-thumb--compact' : ''}`}
          onClick={() => openViewer('video')}
          title="Tam ekran oynatmak için tıklayın"
        >
          <video src={`${url}#t=0.1`} muted playsInline preload="metadata">
            <track kind="captions" />
          </video>
          <span className="chat-wa-media-thumb__play" aria-hidden>
            ▶ Oynat
          </span>
        </button>
        <ChatMediaLightbox
          open={viewerOpen && viewerKind === 'video'}
          onClose={() => setViewerOpen(false)}
          url={url}
          kind="video"
        />
      </>
    )
  }

  if (url) {
    return (
      <>
        <button
          type="button"
          className={`chat-wa-file-chip${mine ? ' chat-wa-file-chip--mine' : ''}`}
          onClick={() => setDocOpen(true)}
          title="Önizlemek için tıklayın"
        >
          <span className="chat-wa-file-chip__icon" aria-hidden>
            {icon}
          </span>
          <span className="chat-wa-file-chip__name">{fileName}</span>
        </button>
        <ChatDocumentPreviewModal
          open={docOpen}
          onClose={() => setDocOpen(false)}
          storagePath={yol}
          url={url}
          fileName={fileName}
          mime={mime}
        />
      </>
    )
  }

  return null
}
