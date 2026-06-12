import { createChatAttachmentSignedUrl } from '../../../lib/chatApi.js'

export const MAX_TEXT_PREVIEW_BYTES = 512 * 1024

function extOf(name) {
  const n = String(name || '').toLowerCase()
  const i = n.lastIndexOf('.')
  return i >= 0 ? n.slice(i + 1) : ''
}

const TEXT_EXTS = new Set([
  'txt',
  'log',
  'csv',
  'md',
  'json',
  'xml',
  'yaml',
  'yml',
  'ini',
  'env',
  'rtf',
  'tsv',
])

const TEXT_MIMES = new Set([
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/xml',
  'text/xml',
  'text/tab-separated-values',
])

/** @returns {'text' | 'pdf' | 'download'} */
export function getAttachmentPreviewKind({ mime, fileName }) {
  const m = String(mime || '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  const ext = extOf(fileName)
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (TEXT_MIMES.has(m) || m.startsWith('text/')) return 'text'
  if (TEXT_EXTS.has(ext)) return 'text'
  return 'download'
}

export async function fetchTextAttachmentContent(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch_failed')
  const blob = await res.blob()
  if (blob.size > MAX_TEXT_PREVIEW_BYTES) {
    const err = new Error('too_large')
    err.code = 'too_large'
    throw err
  }
  return blob.text()
}

function sanitizeDownloadFileName(name) {
  const base = String(name || 'dosya')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .trim()
  return base || 'dosya'
}

function clickBlobDownload(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = sanitizeDownloadFileName(fileName)
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
  }
}

async function fetchBlobFromUrl(downloadUrl) {
  const res = await fetch(downloadUrl)
  if (!res.ok) throw new Error('download_fetch_failed')
  return res.blob()
}

/**
 * Supabase URL’sini yeni sekmede açmaz; blob olarak alıp Web Share veya yerel indirme yapar.
 * @param {string} [storagePath] Birincil URL başarısız olursa yedek imza.
 */
export async function shareChatAttachmentFile(url, fileName, mime, storagePath = null) {
  if (!url && !storagePath) throw new Error('share_unavailable')
  const name = sanitizeDownloadFileName(fileName)
  let blob = null

  if (url) {
    try {
      blob = await fetchBlobFromUrl(url)
    } catch (e) {
      console.warn('[chat share] primary', e?.message || e)
    }
  }

  if (!blob && storagePath) {
    const dlUrl = await createChatAttachmentSignedUrl(storagePath, 3600, { download: name })
    if (dlUrl) blob = await fetchBlobFromUrl(dlUrl)
  }

  if (!blob) throw new Error('share_fetch_failed')

  const type = mime || blob.type || 'application/octet-stream'
  if (typeof File !== 'undefined' && typeof navigator !== 'undefined' && navigator.share) {
    const file = new File([blob], name, { type })
    const canShareFiles = !navigator.canShare || navigator.canShare({ files: [file] })
    if (canShareFiles) {
      try {
        await navigator.share({ files: [file], title: name })
        return true
      } catch (e) {
        if (e?.name === 'AbortError') return false
        console.warn('[chat share] navigator.share', e?.message || e)
      }
    }
  }

  clickBlobDownload(blob, name)
  return true
}

/** @deprecated shareChatAttachmentFile kullanın */
export async function triggerAttachmentDownload(url, fileName, storagePath = null) {
  return shareChatAttachmentFile(url, fileName, null, storagePath)
}

export function fileTypeIcon(fileName, kind) {
  if (kind === 'pdf') return '📕'
  if (kind === 'text') return '📄'
  const ext = extOf(fileName)
  if (['doc', 'docx'].includes(ext)) return '📝'
  if (['xls', 'xlsx'].includes(ext)) return '📊'
  if (['ppt', 'pptx'].includes(ext)) return '📽'
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜'
  return '📎'
}
